import type { VerificationStreamEvent } from "@architectai/shared";
import type { LlmGateway } from "@/ai/gateway";
import type { AppDatabase, TenantContext } from "@/db/client";
import { withTenant } from "@/db/client";
import { logger } from "@/lib/logger";
import { recordAudit } from "@/services/audit.service";
import { isTier2VerificationEnabled } from "@/lib/verification-feature";
import { recordVerificationMetric } from "@/lib/verification-metrics";
import {
  completeVerificationRun,
  failVerificationRun,
  getFindingsForRun,
  insertVerificationFindings,
  updateVerificationRunTrustGrade,
} from "@/services/verification.service";
import { loadVerificationContext } from "@/verification/context";
import { runTier1 } from "@/verification/run-tier1";
import { runTier2, TIER2_ENGINE_VERSION } from "@/verification/run-tier2";
import type { VerificationStreamHub } from "@/verification/stream-hub";
import { computeTrustGrade } from "@/verification/trust-grade";
import { TIER1_ENGINE_VERSION } from "@/verification/types";

export interface RunVerificationOpts {
  runId: string;
  architectureId: string;
  version: number;
  organizationId: string;
  llm: LlmGateway;
}

export async function runVerificationJob(
  db: AppDatabase,
  hub: VerificationStreamHub,
  ctx: TenantContext,
  opts: RunVerificationOpts,
): Promise<void> {
  const { runId, architectureId, version, llm } = opts;
  try {
    const existing = await hub.getSnapshot(runId);
    if (!existing) await hub.init(runId, architectureId);

    await hub.publish(runId, {
      type: "verification.progress",
      payload: { checksComplete: 0, checksTotal: 5, tier: "deterministic" },
    });

    const tier1Result = await withTenant(db, ctx, async (tx) => {
      const vctx = await loadVerificationContext(tx, architectureId);
      if (!vctx) throw new Error("Architecture not ready for verification");
      return { vctx, result: runTier1(vctx) };
    });

    await hub.publish(runId, {
      type: "verification.progress",
      payload: { checksComplete: 3, checksTotal: 5, tier: "deterministic" },
    });

    await withTenant(db, ctx, async (tx) => {
      const findingInputs = tier1Result.result.findings.map((f) => ({
        serviceId: f.serviceId,
        lineageNodeId: f.lineageNodeId,
        check: f.check,
        tier: f.tier,
        verdict: f.verdict,
        confidence: f.confidence,
        groundTruthSource: f.groundTruthSource,
        detail: f.detail,
        evidenceRef: f.evidenceRef,
      }));

      const rows = await insertVerificationFindings(tx, runId, architectureId, findingInputs);
      for (const finding of rows) {
        await hub.publish(runId, {
          type: "verification.finding",
          payload: { finding },
        });
      }

      await completeVerificationRun(tx, runId, {
        trustGrade: tier1Result.result.trustGrade.score,
      });

      await recordAudit(tx, {
        organizationId: ctx.organizationId,
        userId: ctx.userId,
        eventType: "architecture.verified",
        resourceType: "architecture",
        resourceId: architectureId,
        payload: {
          runId,
          version,
          trustGrade: tier1Result.result.trustGrade.score,
          timingMs: tier1Result.result.timingMs,
          tier: "deterministic",
        },
      });
    });

    recordVerificationMetric("verification.run_complete", { architectureId, tier: "deterministic" });

    await hub.publish(runId, {
      type: "verification.progress",
      payload: { checksComplete: 5, checksTotal: 5, tier: "deterministic" },
    });

    await hub.publish(runId, {
      type: "verification.complete",
      payload: {
        runId,
        trustGrade: tier1Result.result.trustGrade.score,
        trustGradeBreakdown: tier1Result.result.trustGrade,
      },
    });
    await hub.setStatus(runId, "complete");

    scheduleTier2Verification(db, hub, ctx, {
      runId,
      architectureId,
      version,
      llm,
      serviceCount: tier1Result.vctx.services.length,
    });
  } catch (err) {
    logger.error({ err, runId, architectureId }, "Verification job failed");
    recordVerificationMetric("verification.run_failed", { architectureId });
    const message = err instanceof Error ? err.message : "Verification failed";
    await hub.publish(runId, {
      type: "verification.error",
      payload: { message },
    });
    await hub.setStatus(runId, "failed", message);
    await withTenant(db, ctx, async (tx) => {
      await failVerificationRun(tx, runId);
    }).catch(() => undefined);
  }
}

export interface Tier2JobOpts {
  runId: string;
  architectureId: string;
  version: number;
  llm: LlmGateway;
  serviceCount: number;
}

/** Enqueue Tier-2 cross-model pass after Tier-1 complete — never blocks Lock. */
export function scheduleTier2Verification(
  db: AppDatabase,
  hub: VerificationStreamHub,
  ctx: TenantContext,
  opts: Tier2JobOpts,
): void {
  if (!isTier2VerificationEnabled()) return;
  void runTier2Job(db, hub, ctx, opts);
}

async function runTier2Job(
  db: AppDatabase,
  hub: VerificationStreamHub,
  ctx: TenantContext,
  opts: Tier2JobOpts,
): Promise<void> {
  const { runId, architectureId, llm, serviceCount } = opts;
  if (serviceCount === 0) return;

  try {
    const checksTotal = serviceCount;
    await hub.publish(runId, {
      type: "verification.progress",
      payload: { checksComplete: 0, checksTotal, tier: "probabilistic" },
    });

    const vctx = await withTenant(db, ctx, async (tx) => {
      const loaded = await loadVerificationContext(tx, architectureId);
      if (!loaded) throw new Error("Architecture not ready for Tier-2 verification");
      return loaded;
    });

    const tier2Result = await runTier2(llm, vctx);

    let checksComplete = 0;
    for (const draft of tier2Result.findings) {
      const persisted = await withTenant(db, ctx, async (tx) => {
        const [row] = await insertVerificationFindings(tx, runId, architectureId, [
          {
            serviceId: draft.serviceId,
            lineageNodeId: draft.lineageNodeId,
            check: draft.check,
            tier: draft.tier,
            verdict: draft.verdict,
            confidence: draft.confidence,
            groundTruthSource: draft.groundTruthSource,
            detail: draft.detail,
            evidenceRef: draft.evidenceRef,
          },
        ]);
        return row!;
      });

      checksComplete += 1;
      await hub.publish(runId, {
        type: "verification.finding",
        payload: { finding: persisted },
      });
      await hub.publish(runId, {
        type: "verification.progress",
        payload: { checksComplete, checksTotal, tier: "probabilistic" },
      });
    }

    await withTenant(db, ctx, async (tx) => {
      const allFindings = await getFindingsForRun(tx, runId);
      const vctx = await loadVerificationContext(tx, architectureId);
      if (!vctx) return;

      const trustGrade = computeTrustGrade({
        findings: allFindings,
        services: vctx.services,
      });

      await updateVerificationRunTrustGrade(tx, runId, {
        trustGrade: trustGrade.score,
        engineVersions: {
          tier1: TIER1_ENGINE_VERSION,
          tier2: TIER2_ENGINE_VERSION,
        },
      });
    });
  } catch (err) {
    logger.error({ err, runId, architectureId }, "Tier-2 verification failed");
  }
}

export function formatVerificationSseEvent(seq: number, event: VerificationStreamEvent): string {
  return `id: ${seq}\ndata: ${JSON.stringify(event)}\n\n`;
}

export async function collectVerificationSseEvents(
  hub: VerificationStreamHub,
  runId: string,
  maxMs = 5000,
): Promise<VerificationStreamEvent[]> {
  const start = Date.now();
  let lastSeq = 0;
  const out: VerificationStreamEvent[] = [];
  while (Date.now() - start < maxMs) {
    const snap = await hub.waitForEvent(runId, lastSeq);
    for (let i = lastSeq; i < snap.events.length; i++) {
      out.push(snap.events[i]!);
    }
    lastSeq = snap.seq;
    if (snap.status !== "running") break;
    await new Promise((r) => setTimeout(r, 20));
  }
  return out;
}

export async function waitForTier2Complete(
  hub: VerificationStreamHub,
  runId: string,
  maxMs = 15_000,
): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < maxMs) {
    const snap = await hub.getSnapshot(runId);
    if (!snap) return false;
    const progress = [...snap.events]
      .reverse()
      .find(
        (e) =>
          e.type === "verification.progress" &&
          e.payload.tier === "probabilistic" &&
          e.payload.checksComplete === e.payload.checksTotal &&
          e.payload.checksTotal > 0,
      );
    if (progress) return true;
    await new Promise((r) => setTimeout(r, 50));
  }
  return false;
}
