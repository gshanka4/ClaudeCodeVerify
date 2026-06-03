import type { TrustGradeBreakdown, VerificationOverride, VerificationSummary } from "@architectai/shared";
import { ApiError } from "@/lib/errors";
import type { AuthContext } from "@/middleware/auth";
import { recordAudit } from "@/services/audit.service";
import { recordVerificationMetric } from "@/lib/verification-metrics";
import type { AppTx } from "@/db/client";
import { getArchitectureDetail } from "@/services/architectures.service";
import { overridesForBreakdown } from "@/services/verification-gate.service";
import {
  getLatestVerificationRun,
  getVerificationFindingById,
  recordVerificationOverride,
} from "@/services/verification.service";
import { computeTrustGrade } from "@/verification/trust-grade";
import { rollupComponentVerdicts } from "@/verification/rollup";

export interface OverrideResult {
  override: VerificationOverride;
  trustGrade: TrustGradeBreakdown;
}

export async function recordOverrideWithAudit(
  tx: AppTx,
  auth: AuthContext,
  architectureId: string,
  findingId: string,
  reason: string,
): Promise<OverrideResult> {
  const finding = await getVerificationFindingById(tx, findingId);
  if (!finding || finding.architectureId !== architectureId) {
    throw ApiError.notFound("Verification finding not found");
  }

  if (finding.verdict !== "conflict") {
    throw ApiError.conflict("Overrides are only allowed on conflict findings");
  }

  const override = await recordVerificationOverride(tx, {
    findingId,
    architectureId,
    userId: auth.userId,
    reason,
  });

  const detail = await getArchitectureDetail(tx, architectureId);
  const latest = await getLatestVerificationRun(tx, architectureId);
  const trustGrade = computeTrustGrade({
    findings: latest?.findings ?? [finding],
    services: detail?.services ?? [],
    overrides: overridesForBreakdown([...(latest?.overrides ?? []), override]),
  });

  await recordAudit(tx, {
    organizationId: auth.organizationId,
    userId: auth.userId,
    eventType: "architecture.override_recorded",
    resourceType: "architecture",
    resourceId: architectureId,
    payload: {
      findingId,
      overrideId: override.id,
      reason: override.reason,
      trustGrade: trustGrade.score,
    },
  });
  recordVerificationMetric("verification.override_recorded", { architectureId });

  return { override, trustGrade };
}

export async function buildVerificationSummary(
  tx: AppTx,
  architectureId: string,
): Promise<VerificationSummary | null> {
  const latest = await getLatestVerificationRun(tx, architectureId);
  if (!latest) return null;

  const detail = await getArchitectureDetail(tx, architectureId);
  const trustGrade = computeTrustGrade({
    findings: latest.findings,
    services: detail?.services ?? [],
    overrides: overridesForBreakdown(latest.overrides),
  });

  return {
    run: latest.run,
    findings: latest.findings,
    componentRollups: rollupComponentVerdicts(latest.findings),
    trustGrade,
    overrides: latest.overrides,
  };
}
