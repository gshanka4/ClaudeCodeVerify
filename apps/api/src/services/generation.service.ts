import { INTERROGATION } from "@architectai/config";
import { eq } from "drizzle-orm";
import type { AppDatabase, AppTx, TenantContext } from "@/db/client";
import { schema } from "@/db/schema";
import { runGenerationJob } from "@/generation/runner";
import type { GenerationJobStatus } from "@architectai/shared";
import type { GenerationStreamEvent } from "@architectai/shared";
import type { GenerationStreamHub } from "@/generation/stream-hub";
import type { VerificationStreamHub } from "@/verification/stream-hub";
import { ApiError } from "@/lib/errors";
import { recordAudit } from "@/services/audit.service";

export interface StartGenerationInput {
  sessionId: string;
  /** UX-A: stretch mock stream for overlay pacing tests. */
  slowMode?: boolean;
}

export interface StartGenerationResult {
  architectureId: string;
  streamUrl: string;
  deduped?: boolean;
}

export async function startGeneration(
  tx: AppTx,
  ctx: TenantContext,
  input: StartGenerationInput,
): Promise<StartGenerationResult> {
  const [session] = await tx
    .select()
    .from(schema.interrogationSessions)
    .where(eq(schema.interrogationSessions.id, input.sessionId))
    .limit(1);
  if (!session) throw ApiError.notFound("Interrogation session not found");
  if (session.status !== "complete") {
    throw ApiError.validation(
      `Complete all ${INTERROGATION.maxQuestions} interrogation questions before generation`,
    );
  }

  const questions = await tx
    .select()
    .from(schema.interrogationQuestions)
    .where(eq(schema.interrogationQuestions.sessionId, input.sessionId));

  const resolved = questions.filter(
    (q) => q.status === "answered" || q.status === "skipped",
  ).length;
  if (resolved < INTERROGATION.maxQuestions) {
    throw ApiError.validation(
      `Complete all ${INTERROGATION.maxQuestions} interrogation questions before generation`,
    );
  }

  if (session.architectureId) {
    const [existing] = await tx
      .select()
      .from(schema.architectures)
      .where(eq(schema.architectures.id, session.architectureId))
      .limit(1);
    if (existing) {
      if (existing.status === "generating") {
        return {
          architectureId: existing.id,
          streamUrl: `/api/generate/stream/${existing.id}`,
          deduped: true,
        };
      }
      if (existing.status === "draft") {
        await tx
          .update(schema.architectures)
          .set({ status: "generating", updatedAt: new Date() })
          .where(eq(schema.architectures.id, existing.id));
        return {
          architectureId: existing.id,
          streamUrl: `/api/generate/stream/${existing.id}`,
          deduped: false,
        };
      }
      if (existing.status === "ready") {
        return {
          architectureId: existing.id,
          streamUrl: `/api/generate/stream/${existing.id}`,
          deduped: true,
        };
      }
    }
  }

  const [arch] = await tx
    .insert(schema.architectures)
    .values({
      organizationId: ctx.organizationId,
      createdById: ctx.userId,
      name: `Architecture — ${session.initialPrompt.slice(0, 48)}`,
      description: session.initialPrompt.slice(0, 500),
      status: "generating",
      inputPrompt: session.initialPrompt,
      interrogationSessionId: session.id,
    })
    .returning();

  await tx
    .update(schema.interrogationSessions)
    .set({ architectureId: arch!.id, status: "complete" })
    .where(eq(schema.interrogationSessions.id, session.id));

  await recordAudit(tx, {
    organizationId: ctx.organizationId,
    userId: ctx.userId,
    eventType: "architecture.generation.started",
    resourceType: "architecture",
    resourceId: arch!.id,
    payload: { sessionId: input.sessionId },
  });

  return {
    architectureId: arch!.id,
    streamUrl: `/api/generate/stream/${arch!.id}`,
  };
}

export async function cancelGeneration(
  tx: AppTx,
  ctx: TenantContext,
  architectureId: string,
): Promise<{ cancelled: boolean; reason?: string }> {
  const [arch] = await tx
    .select()
    .from(schema.architectures)
    .where(eq(schema.architectures.id, architectureId))
    .limit(1);
  if (!arch) throw ApiError.notFound("Architecture not found");

  if (arch.status === "ready") {
    return { cancelled: false, reason: "already_complete" };
  }
  if (arch.status !== "generating") {
    return { cancelled: false, reason: "not_generating" };
  }

  await tx
    .update(schema.architectures)
    .set({ status: "draft", updatedAt: new Date() })
    .where(eq(schema.architectures.id, architectureId));

  await recordAudit(tx, {
    organizationId: ctx.organizationId,
    userId: ctx.userId,
    eventType: "architecture.generation.cancelled",
    resourceType: "architecture",
    resourceId: architectureId,
    payload: {},
  });

  return { cancelled: true };
}

export function scheduleGenerationJob(
  db: AppDatabase,
  genHub: GenerationStreamHub,
  verifyHub: VerificationStreamHub,
  llm: import("@/ai/gateway").LlmGateway,
  ctx: TenantContext,
  architectureId: string,
  sessionId: string,
  opts?: {
    injectBadRef?: boolean;
    crashAfterEvents?: number;
    slowMode?: boolean;
    failAfterEvents?: number;
    reinit?: boolean;
  },
): void {
  const run = async () => {
    if (opts?.reinit) {
      await genHub.init(architectureId);
    } else {
      const existing = await genHub.getSnapshot(architectureId);
      if (!existing) await genHub.init(architectureId);
    }
    await runGenerationJob(db, genHub, verifyHub, llm, ctx, {
      architectureId,
      sessionId,
      injectBadRef: opts?.injectBadRef,
      crashAfterEvents: opts?.crashAfterEvents,
      slowMode: opts?.slowMode,
      failAfterEvents: opts?.failAfterEvents,
    });
  };
  void run();
}

export async function getGenerationJobStatus(
  hub: GenerationStreamHub,
  architectureId: string,
): Promise<GenerationJobStatus | null> {
  const snap = await hub.getSnapshot(architectureId);
  if (!snap) return null;

  let progress: GenerationJobStatus["progress"] = null;
  let error: string | null = snap.failedReason ?? null;
  for (let i = snap.events.length - 1; i >= 0; i--) {
    const ev = snap.events[i] as GenerationStreamEvent;
    if (!progress && ev.type === "progress") progress = ev.payload;
    if (!error && ev.type === "error") error = ev.payload.message;
  }

  return {
    architectureId,
    status: snap.status,
    lastEventId: snap.seq,
    progress,
    error,
  };
}

export async function shouldRescheduleGeneration(
  hub: GenerationStreamHub,
  architectureId: string,
): Promise<boolean> {
  const snap = await hub.getSnapshot(architectureId);
  if (!snap) return true;
  return snap.status === "failed" || snap.status === "cancelled";
}

export async function getArchitectureGenerationCounts(
  tx: AppTx,
  architectureId: string,
): Promise<{
  services: number;
  connections: number;
  lineageNodes: number;
  lineageEdges: number;
  traces: number;
}> {
  const allSvc = await tx
    .select()
    .from(schema.archServices)
    .where(eq(schema.archServices.architectureId, architectureId));
  const connections = await tx
    .select()
    .from(schema.serviceConnections)
    .where(eq(schema.serviceConnections.architectureId, architectureId));
  const nodes = await tx
    .select()
    .from(schema.decisionLineageNodes)
    .where(eq(schema.decisionLineageNodes.architectureId, architectureId));
  const edges = await tx
    .select()
    .from(schema.decisionLineageEdges)
    .where(eq(schema.decisionLineageEdges.architectureId, architectureId));
  const traces = await tx
    .select()
    .from(schema.decisionTraces)
    .where(eq(schema.decisionTraces.architectureId, architectureId));

  return {
    services: allSvc.length,
    connections: connections.length,
    lineageNodes: nodes.length,
    lineageEdges: edges.length,
    traces: traces.length,
  };
}
