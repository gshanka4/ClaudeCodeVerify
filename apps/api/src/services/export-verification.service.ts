import type { TrustGradeBreakdown, VerificationManifestStamp } from "@architectai/shared";
import type { AppTx } from "@/db/client";
import { ApiError } from "@/lib/errors";
import { getArchitectureDetail } from "@/services/architectures.service";
import { overridesForBreakdown } from "@/services/verification-gate.service";
import {
  getCompleteRunForVersion,
  getCompleteRunWithFindingsForVersion,
  getLatestVerificationRun,
  getRunningRunForVersion,
} from "@/services/verification.service";
import { computeTrustGrade } from "@/verification/trust-grade";
import { isVerificationEnabled } from "@/lib/verification-feature";
import { recordVerificationMetric } from "@/lib/verification-metrics";

export type VerificationStatus = "none" | "pending" | "running" | "complete";

export interface ArchitectureVerificationMeta {
  verificationStatus: VerificationStatus;
  trustGrade: number | null;
}

/** Resolve verification status + Trust Grade for dashboard summaries. */
export async function getArchitectureVerificationMeta(
  tx: AppTx,
  architectureId: string,
  version: number,
): Promise<ArchitectureVerificationMeta> {
  const running = await getRunningRunForVersion(tx, architectureId, version);
  if (running) {
    return { verificationStatus: "running", trustGrade: running.trustGrade || null };
  }

  const complete = await getCompleteRunForVersion(tx, architectureId, version);
  if (complete) {
    return { verificationStatus: "complete", trustGrade: complete.trustGrade };
  }

  const latest = await getLatestVerificationRun(tx, architectureId);
  if (!latest) {
    return { verificationStatus: "none", trustGrade: null };
  }

  return { verificationStatus: "pending", trustGrade: null };
}

export async function batchArchitectureVerificationMeta(
  tx: AppTx,
  rows: Array<{ id: string; version: number }>,
): Promise<Map<string, ArchitectureVerificationMeta>> {
  const out = new Map<string, ArchitectureVerificationMeta>();
  for (const row of rows) {
    out.set(row.id, await getArchitectureVerificationMeta(tx, row.id, row.version));
  }
  return out;
}

/** FR-10 — export requires completed verification for the locked version. */
export async function assertExportVerificationReady(
  tx: AppTx,
  architectureId: string,
  lockedVersion: number,
  expectedRunId?: string,
): Promise<VerificationManifestStamp> {
  if (!isVerificationEnabled()) {
    throw ApiError.conflict(
      "Verification is disabled — export manifest stamp unavailable",
    );
  }

  const running = await getRunningRunForVersion(tx, architectureId, lockedVersion);
  if (running) {
    recordVerificationMetric("verification.export_blocked", { reason: "in_progress" });
    throw ApiError.conflict(
      "Verification is still in progress for the locked version — export blocked",
    );
  }

  const verification = await getCompleteRunWithFindingsForVersion(
    tx,
    architectureId,
    lockedVersion,
  );
  if (!verification) {
    recordVerificationMetric("verification.export_blocked", { reason: "no_complete_run" });
    throw ApiError.conflict(
      "No completed verification run for the locked architecture version — export blocked",
    );
  }

  if (expectedRunId && verification.run.id !== expectedRunId) {
    recordVerificationMetric("verification.export_blocked", { reason: "stale_run" });
    throw ApiError.conflict(
      "Verification run does not match the locked version snapshot — re-lock after verification",
    );
  }

  const detail = await getArchitectureDetail(tx, architectureId);
  const trustGradeBreakdown: TrustGradeBreakdown = computeTrustGrade({
    findings: verification.findings,
    services: detail?.services ?? [],
    overrides: overridesForBreakdown(verification.overrides),
  });

  return {
    verificationRunId: verification.run.id,
    trustGrade: verification.run.trustGrade,
    trustGradeBreakdown,
    overrides: verification.overrides.map((o) => ({
      findingId: o.findingId,
      reason: o.reason,
      createdAt: o.createdAt,
    })),
  };
}
