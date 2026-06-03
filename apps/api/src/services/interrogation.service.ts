import { INTERROGATION } from "@architectai/config";
import type {
  InterrogationQuestion,
  InterrogationSession,
  QuestionCategory,
  QuestionOption,
  QuestionWarning,
} from "@architectai/shared";
import type { InterrogationSessionSummary } from "@architectai/shared";
import { and, asc, desc, eq } from "drizzle-orm";
import type { LlmGateway } from "@/ai/gateway";
import { buildInterrogationFallbackQuestion } from "@/ai/fallback-question";
import { INTERROGATION_NEXT_QUESTION_PROMPT } from "@/ai/prompts/interrogation";
import { generateInterrogationBatch } from "@/services/interrogation-batch";
import type { GeneratedQuestion } from "@/ai/schemas/interrogation";
import { generatedQuestionSchema } from "@/ai/schemas/interrogation";
import { logger } from "@/lib/logger";
import type { AppTx, TenantContext } from "@/db/client";
import { schema } from "@/db/schema";
import { ApiError } from "@/lib/errors";
import { recordAudit } from "@/services/audit.service";

type SessionRow = typeof schema.interrogationSessions.$inferSelect;
type QuestionRow = typeof schema.interrogationQuestions.$inferSelect;

const GOVERNANCE_CATEGORIES = new Set<QuestionCategory>(["security", "compliance"]);

function mapOptions(raw: unknown, startHint = 1): QuestionOption[] {
  const arr = Array.isArray(raw) ? raw : [];
  return arr.map((item, i) => {
    const o = item as Record<string, unknown>;
    return {
      id: String(o.id ?? `opt-${i}`),
      label: String(o.label ?? ""),
      description: String(o.description ?? ""),
      badge: (o.badge as QuestionOption["badge"]) ?? null,
      badgeVariant: (o.badgeVariant as QuestionOption["badgeVariant"]) ?? null,
      keyboardHint: (Number(o.keyboardHint) || startHint + i) as 1 | 2 | 3 | 4,
    };
  });
}

function mapQuestion(row: QuestionRow): InterrogationQuestion {
  return {
    id: row.id,
    sessionId: row.sessionId,
    index: row.questionIndex,
    category: row.category,
    status: row.status,
    questionText: row.questionText,
    warningContext: (row.warningJson as QuestionWarning | null) ?? null,
    options: mapOptions(row.optionsJson),
    selectedOptionId: row.selectedOptionId,
    freeformAnswer: row.freeformAnswer,
    confidenceImpact: row.confidenceImpact,
    answeredAt: row.answeredAt,
  };
}

function mapSession(
  row: SessionRow,
  questions: InterrogationQuestion[],
  linkedArchitectureStatus?: InterrogationSession["linkedArchitectureStatus"],
): InterrogationSession {
  return {
    id: row.id,
    organizationId: row.organizationId,
    userId: row.userId,
    architectureId: row.architectureId,
    linkedArchitectureStatus: linkedArchitectureStatus ?? null,
    initialPrompt: row.initialPrompt,
    status: row.status as InterrogationSession["status"],
    contextGatheringProgress: row.contextGatheringProgress,
    governanceCoverageProgress: row.governanceCoverageProgress,
    questions,
    currentQuestionIndex: row.currentQuestionIndex,
    createdAt: row.createdAt,
    completedAt: row.completedAt,
  };
}

function countAnswered(questions: QuestionRow[]): number {
  return questions.filter((q) => q.status === "answered").length;
}

function countResolved(questions: QuestionRow[]): number {
  return questions.filter((q) => q.status === "answered" || q.status === "skipped").length;
}

/** Phase H: generation starts only after all maxQuestions are resolved (no LLM early exit). */
function isSessionComplete(questions: QuestionRow[]): boolean {
  return countResolved(questions) >= INTERROGATION.maxQuestions;
}

function computeProgress(questions: QuestionRow[]): {
  contextGathering: number;
  governanceCoverage: number;
} {
  const answered = questions.filter((q) => q.status === "answered");
  const total = questions.length || 1;
  const contextGathering = Math.min(
    100,
    Math.round((answered.length / Math.min(INTERROGATION.maxQuestions, total)) * 100),
  );
  const govAnswered = answered.filter((q) => GOVERNANCE_CATEGORIES.has(q.category)).length;
  const governanceCoverage = Math.min(100, govAnswered * 35);
  return { contextGathering, governanceCoverage };
}

function canGenerate(questions: QuestionRow[]): boolean {
  return countAnswered(questions) >= INTERROGATION.minQuestions;
}

function questionsRemaining(questions: QuestionRow[]): number {
  return Math.max(0, INTERROGATION.maxQuestions - questions.length);
}

function answeredSummary(questions: QuestionRow[]): string {
  return questions
    .filter((q) => q.status === "answered" || q.status === "skipped")
    .map((q) => {
      const ans = q.selectedOptionId ?? q.freeformAnswer ?? "(skipped)";
      return `#${q.questionIndex} ${q.category}: ${ans}`;
    })
    .join("\n");
}

async function loadSessionQuestions(tx: AppTx, sessionId: string): Promise<QuestionRow[]> {
  return tx
    .select()
    .from(schema.interrogationQuestions)
    .where(eq(schema.interrogationQuestions.sessionId, sessionId))
    .orderBy(asc(schema.interrogationQuestions.questionIndex));
}

async function loadSessionOrThrow(tx: AppTx, sessionId: string): Promise<SessionRow> {
  const [row] = await tx
    .select()
    .from(schema.interrogationSessions)
    .where(eq(schema.interrogationSessions.id, sessionId))
    .limit(1);
  if (!row) throw ApiError.notFound("Interrogation session not found");
  if (row.status !== "active") throw ApiError.conflict("Session is not active");
  return row;
}

async function generateQuestionPayload(
  llm: LlmGateway,
  session: SessionRow,
  questions: QuestionRow[],
  nextIndex: number,
): Promise<GeneratedQuestion> {
  const categoriesUsed = [...new Set(questions.map((q) => q.category))].join(",");
  try {
    const { data } = await llm.generateStructured({
      workload: "interrogation",
      promptId: INTERROGATION_NEXT_QUESTION_PROMPT.id,
      schema: generatedQuestionSchema,
      variables: {
        initialPrompt: session.initialPrompt.slice(0, 8000),
        answeredSummary: answeredSummary(questions) || "(none yet)",
        questionIndex: String(nextIndex),
        categoriesUsed,
      },
    });
    return data;
  } catch (err) {
    logger.warn({ err, sessionId: session.id, nextIndex }, "Using interrogation fallback question");
    return buildInterrogationFallbackQuestion(nextIndex);
  }
}

async function insertGeneratedQuestion(
  tx: AppTx,
  sessionId: string,
  nextIndex: number,
  data: GeneratedQuestion,
): Promise<QuestionRow> {
  const options = data.options.map((opt, i) => ({
    ...opt,
    keyboardHint: i + 1,
  }));

  const [inserted] = await txInsertQuestion(tx, {
    sessionId,
    questionIndex: nextIndex,
    category: data.category,
    questionText: data.questionText,
    warningJson: data.warning ?? null,
    optionsJson: options,
    confidenceImpact: data.confidenceImpact,
    status: "pending",
  });

  return inserted!;
}

/** Prefer pre-loaded batch question (no LLM) when available. */
async function resolveNextQuestionRow(
  tx: AppTx,
  llm: LlmGateway,
  session: SessionRow,
  questions: QuestionRow[],
  nextIndex: number,
): Promise<QuestionRow> {
  const existing = questions.find((q) => q.questionIndex === nextIndex);
  if (existing) return existing;

  const data = await generateQuestionPayload(llm, session, questions, nextIndex);
  return insertGeneratedQuestion(tx, session.id, nextIndex, data);
}

async function txInsertQuestion(
  tx: AppTx,
  values: typeof schema.interrogationQuestions.$inferInsert,
): Promise<QuestionRow[]> {
  return tx.insert(schema.interrogationQuestions).values(values).returning();
}

async function syncSessionProgress(tx: AppTx, sessionId: string, questions: QuestionRow[]) {
  const progress = computeProgress(questions);
  await tx
    .update(schema.interrogationSessions)
    .set({
      contextGatheringProgress: progress.contextGathering,
      governanceCoverageProgress: progress.governanceCoverage,
    })
    .where(eq(schema.interrogationSessions.id, sessionId));
}

export interface StartInterrogationInput {
  prompt: string;
  importType?: string;
}

export interface StartInterrogationResult {
  session: InterrogationSession;
  firstQuestion: InterrogationQuestion;
}

export async function startInterrogation(
  tx: AppTx,
  ctx: TenantContext,
  llm: LlmGateway,
  input: StartInterrogationInput,
): Promise<StartInterrogationResult> {
  const prompt = input.prompt.trim();
  if (prompt.length < INTERROGATION.minPromptChars) {
    throw ApiError.validation("Requirement must be at least 20 characters", {
      prompt: [`Minimum ${INTERROGATION.minPromptChars} characters required`],
    });
  }

  const [session] = await tx
    .insert(schema.interrogationSessions)
    .values({
      organizationId: ctx.organizationId,
      userId: ctx.userId,
      initialPrompt: prompt,
      status: "active",
      currentQuestionIndex: 0,
    })
    .returning();

  const batch = await generateInterrogationBatch(llm, prompt);
  const inserted: QuestionRow[] = [];
  for (let i = 0; i < batch.length; i++) {
    inserted.push(await insertGeneratedQuestion(tx, session!.id, i, batch[i]!));
  }
  const first = inserted[0]!;

  await recordAudit(tx, {
    organizationId: ctx.organizationId,
    userId: ctx.userId,
    eventType: "interrogation.started",
    resourceType: "interrogation_session",
    resourceId: session!.id,
    payload: { importType: input.importType ?? "text", promptLength: prompt.length },
  });

  return {
    session: mapSession(session!, inserted.map(mapQuestion)),
    firstQuestion: mapQuestion(first),
  };
}

export async function listInterrogationSessions(
  tx: AppTx,
  ctx: TenantContext,
  input: { status: "active" | "complete"; limit?: number },
): Promise<InterrogationSessionSummary[]> {
  const limit = Math.min(Math.max(input.limit ?? 10, 1), 20);
  const rows = await tx
    .select()
    .from(schema.interrogationSessions)
    .where(
      and(
        eq(schema.interrogationSessions.organizationId, ctx.organizationId),
        eq(schema.interrogationSessions.userId, ctx.userId),
        eq(schema.interrogationSessions.status, input.status),
      ),
    )
    .orderBy(desc(schema.interrogationSessions.createdAt))
    .limit(limit);

  const summaries: InterrogationSessionSummary[] = [];
  for (const row of rows) {
    const questions = await loadSessionQuestions(tx, row.id);
    summaries.push({
      sessionId: row.id,
      initialPrompt: row.initialPrompt,
      answeredCount: countResolved(questions),
      maxQuestions: INTERROGATION.maxQuestions,
      status: row.status as "active" | "complete",
      architectureId: row.architectureId,
      updatedAt: (row.completedAt ?? row.createdAt).toISOString(),
    });
  }
  return summaries;
}

async function loadLinkedArchitectureStatus(
  tx: AppTx,
  architectureId: string | null,
): Promise<InterrogationSession["linkedArchitectureStatus"]> {
  if (!architectureId) return null;
  const [arch] = await tx
    .select({ status: schema.architectures.status })
    .from(schema.architectures)
    .where(eq(schema.architectures.id, architectureId))
    .limit(1);
  if (!arch) return null;
  return arch.status as InterrogationSession["linkedArchitectureStatus"];
}

export async function getInterrogationSession(
  tx: AppTx,
  sessionId: string,
): Promise<InterrogationSession> {
  const [row] = await tx
    .select()
    .from(schema.interrogationSessions)
    .where(eq(schema.interrogationSessions.id, sessionId))
    .limit(1);
  if (!row) throw ApiError.notFound("Interrogation session not found");
  const questions = await loadSessionQuestions(tx, sessionId);
  const linkedArchitectureStatus = await loadLinkedArchitectureStatus(tx, row.architectureId);
  return mapSession(row, questions.map(mapQuestion), linkedArchitectureStatus);
}

export interface AnswerInput {
  questionId: string;
  selectedOptionId?: string | null;
  freeformAnswer?: string | null;
}

export interface AnswerResult {
  nextQuestion: InterrogationQuestion | null;
  sessionProgress: {
    contextGathering: number;
    governanceCoverage: number;
    questionsRemaining: number;
  };
  canGenerate: boolean;
  sessionComplete: boolean;
}

export async function answerQuestion(
  tx: AppTx,
  ctx: TenantContext,
  llm: LlmGateway,
  sessionId: string,
  input: AnswerInput,
): Promise<AnswerResult> {
  const session = await loadSessionOrThrow(tx, sessionId);
  const questions = await loadSessionQuestions(tx, sessionId);
  const question = questions.find((q) => q.id === input.questionId);
  if (!question) throw ApiError.notFound("Question not found");
  if (question.status !== "pending") throw ApiError.conflict("Question is not pending");

  if (!input.selectedOptionId && !input.freeformAnswer?.trim()) {
    throw ApiError.validation("An option or freeform answer is required");
  }

  await tx
    .update(schema.interrogationQuestions)
    .set({
      status: "answered",
      selectedOptionId: input.selectedOptionId ?? null,
      freeformAnswer: input.freeformAnswer?.trim() ?? null,
      answeredAt: new Date(),
    })
    .where(eq(schema.interrogationQuestions.id, input.questionId));

  const updatedQuestions = await loadSessionQuestions(tx, sessionId);
  const nextIndex = session.currentQuestionIndex + 1;

  let nextQuestion: InterrogationQuestion | null = null;
  let sessionComplete = isSessionComplete(updatedQuestions);

  if (!sessionComplete) {
    const nextRow = await resolveNextQuestionRow(tx, llm, session, updatedQuestions, nextIndex);
    nextQuestion = mapQuestion(nextRow);
    await tx
      .update(schema.interrogationSessions)
      .set({ currentQuestionIndex: nextIndex })
      .where(eq(schema.interrogationSessions.id, sessionId));
    const afterNext = await loadSessionQuestions(tx, sessionId);
    sessionComplete = isSessionComplete(afterNext);
  }

  if (sessionComplete) {
    await tx
      .update(schema.interrogationSessions)
      .set({ status: "complete", completedAt: new Date() })
      .where(eq(schema.interrogationSessions.id, sessionId));
  }

  await syncSessionProgress(tx, sessionId, await loadSessionQuestions(tx, sessionId));

  await recordAudit(tx, {
    organizationId: ctx.organizationId,
    userId: ctx.userId,
    eventType: "interrogation.question.answered",
    resourceType: "interrogation_session",
    resourceId: sessionId,
    payload: { questionId: input.questionId },
  });

  const finalQuestions = await loadSessionQuestions(tx, sessionId);
  const progress = computeProgress(finalQuestions);

  return {
    nextQuestion,
    sessionProgress: {
      contextGathering: progress.contextGathering,
      governanceCoverage: progress.governanceCoverage,
      questionsRemaining: questionsRemaining(finalQuestions),
    },
    canGenerate: canGenerate(finalQuestions),
    sessionComplete,
  };
}

export interface SkipInput {
  questionId: string;
}

export async function skipQuestion(
  tx: AppTx,
  ctx: TenantContext,
  llm: LlmGateway,
  sessionId: string,
  input: SkipInput,
): Promise<AnswerResult> {
  const session = await loadSessionOrThrow(tx, sessionId);
  const questions = await loadSessionQuestions(tx, sessionId);
  const question = questions.find((q) => q.id === input.questionId);
  if (!question) throw ApiError.notFound("Question not found");
  if (question.status !== "pending") throw ApiError.conflict("Question is not pending");

  await tx
    .update(schema.interrogationQuestions)
    .set({ status: "skipped", answeredAt: new Date() })
    .where(eq(schema.interrogationQuestions.id, input.questionId));

  const updatedQuestions = await loadSessionQuestions(tx, sessionId);
  const nextIndex = session.currentQuestionIndex + 1;
  let sessionComplete = isSessionComplete(updatedQuestions);

  let nextQuestion: InterrogationQuestion | null = null;
  if (!sessionComplete) {
    const nextRow = await resolveNextQuestionRow(tx, llm, session, updatedQuestions, nextIndex);
    nextQuestion = mapQuestion(nextRow);
    await tx
      .update(schema.interrogationSessions)
      .set({ currentQuestionIndex: nextIndex })
      .where(eq(schema.interrogationSessions.id, sessionId));
    const afterNext = await loadSessionQuestions(tx, sessionId);
    sessionComplete = isSessionComplete(afterNext);
  }

  if (sessionComplete) {
    await tx
      .update(schema.interrogationSessions)
      .set({ status: "complete", completedAt: new Date() })
      .where(eq(schema.interrogationSessions.id, sessionId));
  }

  await syncSessionProgress(tx, sessionId, await loadSessionQuestions(tx, sessionId));

  await recordAudit(tx, {
    organizationId: ctx.organizationId,
    userId: ctx.userId,
    eventType: "interrogation.question.skipped",
    resourceType: "interrogation_session",
    resourceId: sessionId,
    payload: { questionId: input.questionId, confidencePenalty: question.confidenceImpact },
  });

  const finalQuestions = await loadSessionQuestions(tx, sessionId);
  const progress = computeProgress(finalQuestions);

  return {
    nextQuestion,
    sessionProgress: {
      contextGathering: Math.max(0, progress.contextGathering - question.confidenceImpact),
      governanceCoverage: progress.governanceCoverage,
      questionsRemaining: questionsRemaining(finalQuestions),
    },
    canGenerate: canGenerate(finalQuestions),
    sessionComplete,
  };
}

export interface EditInput {
  selectedOptionId?: string | null;
  freeformAnswer?: string | null;
}

export async function editQuestion(
  tx: AppTx,
  ctx: TenantContext,
  sessionId: string,
  questionId: string,
  input: EditInput,
): Promise<{
  updatedProgress: { contextGathering: number; governanceCoverage: number };
  questions: InterrogationQuestion[];
}> {
  await loadSessionOrThrow(tx, sessionId);
  const questions = await loadSessionQuestions(tx, sessionId);
  const question = questions.find((q) => q.id === questionId);
  if (!question) throw ApiError.notFound("Question not found");
  if (question.status !== "answered" && question.status !== "skipped") {
    throw ApiError.conflict("Only answered or skipped questions can be edited");
  }

  if (!input.selectedOptionId && !input.freeformAnswer?.trim()) {
    throw ApiError.validation("An option or freeform answer is required");
  }

  // P2-EC-02: update only this row — later answers are preserved.
  await tx
    .update(schema.interrogationQuestions)
    .set({
      status: "answered",
      selectedOptionId: input.selectedOptionId ?? null,
      freeformAnswer: input.freeformAnswer?.trim() ?? null,
      answeredAt: new Date(),
    })
    .where(eq(schema.interrogationQuestions.id, questionId));

  const updated = await loadSessionQuestions(tx, sessionId);
  await syncSessionProgress(tx, sessionId, updated);

  await recordAudit(tx, {
    organizationId: ctx.organizationId,
    userId: ctx.userId,
    eventType: "interrogation.question.answered",
    resourceType: "interrogation_session",
    resourceId: sessionId,
    payload: { questionId, edited: true },
  });

  const progress = computeProgress(updated);
  return {
    updatedProgress: {
      contextGathering: progress.contextGathering,
      governanceCoverage: progress.governanceCoverage,
    },
    questions: updated.map(mapQuestion),
  };
}
