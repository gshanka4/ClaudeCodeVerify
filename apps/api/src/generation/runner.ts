import type { GenerationStreamEvent } from "@architectai/shared";
import { eq } from "drizzle-orm";
import type { AppDatabase, AppTx, TenantContext } from "@/db/client";
import { withTenant } from "@/db/client";
import { schema } from "@/db/schema";
import { logger } from "@/lib/logger";
import { recordAudit } from "@/services/audit.service";
import { seedDefaultRuleset } from "@/services/governance.service";
import { GENERATION_SLOW_DEFAULT_MS } from "@architectai/config";
import { withGenerationPhase } from "@/lib/generation-phases";
import { blueprintLayerCoverage, ensureLayerCoverage } from "./ensure-layer-coverage";
import {
  buildMockGenerationPlan,
  buildPlanWithBadRef,
  type GenerationPlan,
} from "./mock-plan";
import { buildGenerationPlanFromBlueprint, seedsFromMockDomain } from "./plan-builder";
import { buildRequirementsDigest } from "./requirements-digest";
import { GENERATION_PLAN_PROMPT } from "@/ai/prompts/generation-plan";
import { generationServiceBlueprintSchema } from "@/ai/schemas/generation-plan";
import { LineageIntegrityError, persistGenerationResult } from "./persist";
import type { GenerationStreamHub } from "./stream-hub";
import type { VerificationStreamHub } from "@/verification/stream-hub";
import { triggerAndScheduleVerification } from "@/services/verification-orchestration.service";
import { isVerificationEnabled } from "@/lib/verification-feature";
import type { QuestionRow } from "./types";

export interface RunGenerationOpts {
  architectureId: string;
  sessionId: string;
  /** When true, injects a fabricated lineage ref (P3-EC-01 harness). */
  injectBadRef?: boolean;
  /** Simulates worker crash after N events (P3-EC-12). */
  crashAfterEvents?: number;
  /** UX-A: stretch inter-event delays for overlay pacing tests. */
  slowMode?: boolean;
  /** UX-A: fail after N published events (non-production test harness). */
  failAfterEvents?: number;
}

async function loadSessionContext(
  tx: AppTx,
  sessionId: string,
): Promise<{ questions: QuestionRow[]; prompt: string }> {
  const [session] = await tx
    .select()
    .from(schema.interrogationSessions)
    .where(eq(schema.interrogationSessions.id, sessionId))
    .limit(1);
  if (!session) throw new Error("Session not found");

  const questions = await tx
    .select({
      id: schema.interrogationQuestions.id,
      sessionId: schema.interrogationQuestions.sessionId,
      questionIndex: schema.interrogationQuestions.questionIndex,
      category: schema.interrogationQuestions.category,
      status: schema.interrogationQuestions.status,
      questionText: schema.interrogationQuestions.questionText,
      selectedOptionId: schema.interrogationQuestions.selectedOptionId,
      freeformAnswer: schema.interrogationQuestions.freeformAnswer,
    })
    .from(schema.interrogationQuestions)
    .where(eq(schema.interrogationQuestions.sessionId, sessionId));

  return { questions: questions as QuestionRow[], prompt: session.initialPrompt };
}

async function loadRuleCodes(tx: AppTx, rulesetId: string | null): Promise<string[]> {
  if (!rulesetId) return ["AP-001"];
  const rules = await tx
    .select({ code: schema.governanceRules.code })
    .from(schema.governanceRules)
    .where(eq(schema.governanceRules.rulesetId, rulesetId));
  return rules.map((r) => r.code);
}

export async function runGenerationJob(
  db: AppDatabase,
  genHub: GenerationStreamHub,
  verifyHub: VerificationStreamHub,
  llm: import("@/ai/gateway").LlmGateway,
  ctx: TenantContext,
  opts: RunGenerationOpts,
): Promise<void> {
  let verifyAfterGeneration: string | null = null;
  try {
    await withTenant(db, ctx, async (tx) => {
      const { questions, prompt: sessionPrompt } = await loadSessionContext(tx, opts.sessionId);
      const answered = questions.filter((q) => q.status === "answered");
      const [arch] = await tx
        .select()
        .from(schema.architectures)
        .where(eq(schema.architectures.id, opts.architectureId))
        .limit(1);
      if (!arch) throw new Error("Architecture not found");

      let rulesetId = arch.rulesetId;
      if (!rulesetId) {
        const seeded = await seedDefaultRuleset(tx, {
          organizationId: ctx.organizationId,
          createdById: ctx.userId,
        });
        rulesetId = seeded.id;
        await tx
          .update(schema.architectures)
          .set({ rulesetId })
          .where(eq(schema.architectures.id, opts.architectureId));
      }

      const ruleCodes = await loadRuleCodes(tx, rulesetId);
      const initialPrompt = arch.inputPrompt ?? sessionPrompt;

      await genHub.publish(opts.architectureId, {
        type: "progress",
        payload: withGenerationPhase(
          {
            progress: 2,
            confidenceScore: 70,
            governanceScore: 70,
            aiTrustScore: 68,
            nodesGenerated: 0,
            totalNodes: 8,
            estimatedSecondsRemaining: 35,
          },
          "requirements",
        ),
      });

      const plan: GenerationPlan = opts.injectBadRef
        ? buildPlanWithBadRef(opts.architectureId, answered, ruleCodes, initialPrompt)
        : await buildGenerationPlan(
            opts.architectureId,
            llm,
            answered,
            ruleCodes,
            initialPrompt,
            questions,
          );

      await genHub.publish(opts.architectureId, {
        type: "progress",
        payload: withGenerationPhase(
          {
            progress: 8,
            confidenceScore: 72,
            governanceScore: 74,
            aiTrustScore: 70,
            nodesGenerated: 0,
            totalNodes: plan.services.length,
            estimatedSecondsRemaining: Math.max(10, plan.services.length * 2),
          },
          "services",
        ),
      });

      const refCtx = {
        interrogationRefs: new Set(answered.map((q) => q.id)),
        ruleRefs: new Set(ruleCodes),
      };

      const publishable = plan.events.filter((e) => e.type !== "complete");
      const delayMs = opts.slowMode
        ? Math.max(
            50,
            Math.floor(
              (Number(process.env.GENERATION_SLOW_MS) || GENERATION_SLOW_DEFAULT_MS) /
                Math.max(publishable.length, 1),
            ),
          )
        : 5;

      let eventCount = 0;
      for (const event of plan.events) {
        if (opts.crashAfterEvents !== undefined && eventCount >= opts.crashAfterEvents) {
          throw new Error("simulated_worker_crash");
        }
        if (opts.failAfterEvents !== undefined && eventCount >= opts.failAfterEvents) {
          await genHub.publish(opts.architectureId, {
            type: "error",
            payload: { message: "Simulated generation failure" },
          });
          await genHub.setStatus(opts.architectureId, "failed", "Simulated generation failure");
          await tx
            .update(schema.architectures)
            .set({ status: "draft", updatedAt: new Date() })
            .where(eq(schema.architectures.id, opts.architectureId));
          return;
        }
        if (await genHub.isCancelRequested(opts.architectureId)) {
          await genHub.publish(opts.architectureId, {
            type: "error",
            payload: { message: "Generation cancelled" },
          });
          await genHub.setStatus(opts.architectureId, "cancelled");
          await tx
            .update(schema.architectures)
            .set({ status: "draft", updatedAt: new Date() })
            .where(eq(schema.architectures.id, opts.architectureId));
          return;
        }

        if (event.type !== "complete") {
          await genHub.publish(opts.architectureId, event);
          eventCount += 1;
          await delay(delayMs);
          continue;
        }

        try {
          await persistGenerationResult(tx, opts.architectureId, plan, refCtx);
        } catch (err) {
          if (err instanceof LineageIntegrityError) {
            await genHub.publish(opts.architectureId, {
              type: "error",
              payload: { message: err.message },
            });
            await genHub.setStatus(opts.architectureId, "failed", err.message);
            await tx
              .update(schema.architectures)
              .set({ status: "draft", updatedAt: new Date() })
              .where(eq(schema.architectures.id, opts.architectureId));
            await recordAudit(tx, {
              organizationId: ctx.organizationId,
              userId: ctx.userId,
              eventType: "architecture.generation.failed",
              resourceType: "architecture",
              resourceId: opts.architectureId,
              payload: { code: err.code, message: err.message },
            });
            return;
          }
          throw err;
        }

        await genHub.publish(opts.architectureId, event);
        await genHub.setStatus(opts.architectureId, "complete");
        await recordAudit(tx, {
          organizationId: ctx.organizationId,
          userId: ctx.userId,
          eventType: "architecture.generated",
          resourceType: "architecture",
          resourceId: opts.architectureId,
          payload: { sessionId: opts.sessionId, totalServices: plan.services.length },
        });
        verifyAfterGeneration = opts.architectureId;
      }
    });

    if (verifyAfterGeneration && isVerificationEnabled()) {
      await triggerAndScheduleVerification(db, verifyHub, llm, ctx, {
        architectureId: verifyAfterGeneration,
      });
    }
  } catch (err) {
    logger.error({ err, architectureId: opts.architectureId }, "Generation job failed");
    await genHub.publish(opts.architectureId, {
      type: "error",
      payload: { message: err instanceof Error ? err.message : "Generation failed" },
    });
    await genHub.setStatus(opts.architectureId, "failed", err instanceof Error ? err.message : undefined);
    await withTenant(db, ctx, async (tx) => {
      await tx
        .update(schema.architectures)
        .set({ status: "draft", updatedAt: new Date() })
        .where(eq(schema.architectures.id, opts.architectureId));
      await recordAudit(tx, {
        organizationId: ctx.organizationId,
        userId: ctx.userId,
        eventType: "architecture.generation.failed",
        resourceType: "architecture",
        resourceId: opts.architectureId,
        payload: { reason: "worker_crash" },
      });
    });
  }
}

async function buildGenerationPlan(
  architectureId: string,
  llm: import("@/ai/gateway").LlmGateway,
  answered: QuestionRow[],
  ruleCodes: string[],
  initialPrompt: string,
  allQuestions: QuestionRow[],
): Promise<GenerationPlan> {
  const provider = llm.getProviderName("generation");
  const digest = buildRequirementsDigest(initialPrompt, allQuestions);

  if (provider === "mock") {
    return buildMockGenerationPlan(architectureId, answered, ruleCodes, initialPrompt);
  }

  try {
    const { data, usage } = await llm.generateStructured({
      workload: "generation",
      promptId: GENERATION_PLAN_PROMPT.id,
      schema: generationServiceBlueprintSchema,
      variables: {
        requirementsDigest: digest.slice(0, 12000),
        ruleCodes: ruleCodes.join(","),
      },
    });
    logger.info(
      {
        provider,
        model: usage.model,
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens,
        generatedServices: data.services.length,
        connections: data.connections.length,
      },
      "Generation blueprint produced by LLM provider",
    );
    let enriched = ensureLayerCoverage(data);
    let parsed = generationServiceBlueprintSchema.safeParse(enriched);
    if (!parsed.success) {
      logger.warn({ architectureId }, "Blueprint failed schema; retrying generation once");
      const retry = await llm.generateStructured({
        workload: "generation",
        promptId: GENERATION_PLAN_PROMPT.id,
        schema: generationServiceBlueprintSchema,
        variables: {
          requirementsDigest: `${digest.slice(0, 11000)}\n\nRETRY: include gateway, 2+ services, cache, database, security, 6+ services, 4+ connections.`,
          ruleCodes: ruleCodes.join(","),
        },
      });
      enriched = ensureLayerCoverage(retry.data);
      parsed = generationServiceBlueprintSchema.safeParse(enriched);
    }
    if (!parsed.success) {
      throw new Error("Generation blueprint failed schema validation after retry");
    }
    logger.info(
      {
        layerCoverage: blueprintLayerCoverage(parsed.data),
        serviceCount: parsed.data.services.length,
        connectionCount: parsed.data.connections.length,
      },
      "Generation blueprint layer coverage",
    );
    return buildGenerationPlanFromBlueprint(
      architectureId,
      parsed.data,
      answered,
      ruleCodes,
      initialPrompt,
    );
  } catch (err) {
    logger.warn(
      { err, architectureId, provider },
      "Anthropic generation blueprint failed; using domain fallback plan",
    );
    const fallback = ensureLayerCoverage(seedsFromMockDomain(initialPrompt));
    return buildGenerationPlanFromBlueprint(
      architectureId,
      fallback,
      answered,
      ruleCodes,
      initialPrompt,
    );
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export function formatSseEvent(seq: number, event: GenerationStreamEvent): string {
  return `id: ${seq}\ndata: ${JSON.stringify(event)}\n\n`;
}

export async function collectSseEvents(
  hub: GenerationStreamHub,
  architectureId: string,
  maxMs = 5000,
): Promise<GenerationStreamEvent[]> {
  const start = Date.now();
  let lastSeq = 0;
  const out: GenerationStreamEvent[] = [];
  while (Date.now() - start < maxMs) {
    const snap = await hub.waitForEvent(architectureId, lastSeq);
    for (let i = lastSeq; i < snap.events.length; i++) {
      out.push(snap.events[i]!);
    }
    lastSeq = snap.seq;
    if (snap.status !== "running") break;
    await delay(20);
  }
  return out;
}
