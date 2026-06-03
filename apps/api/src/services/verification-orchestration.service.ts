import { and, desc, eq } from "drizzle-orm";
import type { StartVerificationResponse, VerificationSummary } from "@architectai/shared";
import type { AppDatabase, AppTx, TenantContext } from "@/db/client";
import { withTenant } from "@/db/client";
import { schema } from "@/db/schema";
import { ApiError } from "@/lib/errors";
import { getArchitecture } from "@/services/architectures.service";
import {
  buildVerificationSummary,
  recordOverrideWithAudit,
} from "@/services/verification-override.service";
import {
  createVerificationRun,
  getCompleteRunForVersion,
  getLatestVerificationRun,
  getRunningRunForVersion,
  getVerificationRunById,
} from "@/services/verification.service";
import type { LlmGateway } from "@/ai/gateway";
import { runVerificationJob } from "@/verification/runner";
import type { VerificationStreamHub } from "@/verification/stream-hub";
import { isVerificationEnabled } from "@/lib/verification-feature";
import { recordVerificationMetric } from "@/lib/verification-metrics";

export interface StartVerificationInput {
  architectureId: string;
  force?: boolean;
}

export async function startVerification(
  tx: AppTx,
  ctx: TenantContext,
  input: StartVerificationInput,
): Promise<StartVerificationResponse & { deduped?: boolean }> {
  if (!isVerificationEnabled()) {
    throw ApiError.conflict("Verification is disabled on this deployment");
  }
  const arch = await getArchitecture(tx, input.architectureId);
  if (!arch) throw ApiError.notFound("Architecture not found");
  if (arch.status === "generating") {
    throw ApiError.conflict("Architecture generation in progress");
  }
  if (arch.status !== "ready" && arch.status !== "draft") {
    throw ApiError.conflict(`Architecture status ${arch.status} cannot be verified`);
  }

  if (!input.force) {
    const complete = await getCompleteRunForVersion(tx, input.architectureId, arch.version);
    if (complete) {
      return {
        runId: complete.id,
        streamUrl: streamUrl(input.architectureId, complete.id),
        deduped: true,
      };
    }

    const running = await getRunningRunForVersion(tx, input.architectureId, arch.version);
    if (running) {
      return {
        runId: running.id,
        streamUrl: streamUrl(input.architectureId, running.id),
        deduped: true,
      };
    }
  }

  const run = await createVerificationRun(tx, {
    architectureId: input.architectureId,
    organizationId: ctx.organizationId,
    version: arch.version,
  });
  recordVerificationMetric("verification.run_started", { architectureId: input.architectureId });

  return {
    runId: run.id,
    streamUrl: streamUrl(input.architectureId, run.id),
    deduped: false,
  };
}

function streamUrl(architectureId: string, runId: string): string {
  return `/api/architectures/${architectureId}/verification/stream/${runId}`;
}

export function scheduleVerificationJob(
  db: AppDatabase,
  hub: VerificationStreamHub,
  ctx: TenantContext,
  architectureId: string,
  version: number,
  runId: string,
  llm: LlmGateway,
): void {
  void (async () => {
    await hub.init(runId, architectureId);
    await runVerificationJob(db, hub, ctx, {
      runId,
      architectureId,
      version,
      organizationId: ctx.organizationId,
      llm,
    });
  })();
}

export async function triggerAndScheduleVerification(
  db: AppDatabase,
  hub: VerificationStreamHub,
  llm: LlmGateway,
  ctx: TenantContext,
  input: StartVerificationInput,
): Promise<StartVerificationResponse & { deduped?: boolean }> {
  const result = await withTenant(db, ctx, (tx) => startVerification(tx, ctx, input));
  if (!result.deduped) {
    const arch = await withTenant(db, ctx, (tx) => getArchitecture(tx, input.architectureId));
    if (arch) {
      scheduleVerificationJob(db, hub, ctx, input.architectureId, arch.version, result.runId, llm);
    }
  }
  return result;
}

export async function getVerificationSummaryForArchitecture(
  tx: AppTx,
  architectureId: string,
): Promise<VerificationSummary | null> {
  return buildVerificationSummary(tx, architectureId);
}

export async function getComponentVerification(
  tx: AppTx,
  architectureId: string,
  serviceId: string,
): Promise<{ findings: VerificationSummary["findings"]; run: VerificationSummary["run"] } | null> {
  const summary = await buildVerificationSummary(tx, architectureId);
  if (!summary) return null;
  const findings = summary.findings.filter((f) => f.serviceId === serviceId);
  return { run: summary.run, findings };
}

export async function assertRunBelongsToArchitecture(
  tx: AppTx,
  architectureId: string,
  runId: string,
): Promise<void> {
  const run = await getVerificationRunById(tx, runId);
  if (!run || run.architectureId !== architectureId) {
    throw ApiError.notFound("Verification run not found");
  }
}

export { recordOverrideWithAudit };

export async function waitForVerificationComplete(
  hub: VerificationStreamHub,
  runId: string,
  maxMs = 5000,
): Promise<boolean> {
  const start = Date.now();
  while (Date.now() - start < maxMs) {
    const snap = await hub.getSnapshot(runId);
    if (snap?.status === "complete") return true;
    if (snap?.status === "failed") return false;
    await new Promise((r) => setTimeout(r, 50));
  }
  return false;
}

export async function getLatestRunForArchitectureVersion(
  tx: AppTx,
  architectureId: string,
  version: number,
): Promise<Awaited<ReturnType<typeof getLatestVerificationRun>>> {
  const [runRow] = await tx
    .select()
    .from(schema.verificationRuns)
    .where(
      and(
        eq(schema.verificationRuns.architectureId, architectureId),
        eq(schema.verificationRuns.version, version),
      ),
    )
    .orderBy(desc(schema.verificationRuns.startedAt))
    .limit(1);

  if (!runRow) return null;
  return getLatestVerificationRun(tx, architectureId);
}
