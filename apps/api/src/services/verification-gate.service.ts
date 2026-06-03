import { LOCK_GATE_CRITICALITY } from "@architectai/config";
import type {
  VerificationFinding,
  VerificationGateConflict,
  VerificationOverride,
} from "@architectai/shared";
import { ApiError, VerificationGateError } from "@/lib/errors";
import { recordVerificationMetric } from "@/lib/verification-metrics";
import type { ArchServiceDto, ArchitectureDetailDto } from "@/services/architectures.service";
import type { VerificationRunWithFindings } from "@/services/verification.service";

function isCriticalComponent(svc: ArchServiceDto): boolean {
  if (LOCK_GATE_CRITICALITY.blockOnHasCriticalIssue && svc.hasCriticalIssue) return true;
  if (svc.confidenceTier === LOCK_GATE_CRITICALITY.blockOnConfidenceTier) return true;
  return false;
}

function isBlockingFinding(
  finding: VerificationFinding,
  services: ArchServiceDto[],
): boolean {
  if (finding.tier !== "deterministic" || finding.verdict !== "conflict") return false;
  if (!finding.serviceId) return false;
  const svc = services.find((s) => s.id === finding.serviceId);
  if (!svc) return true;
  return isCriticalComponent(svc);
}

export function evaluateLockGate(
  detail: ArchitectureDetailDto,
  verification: VerificationRunWithFindings,
): VerificationGateConflict[] {
  const overriddenIds = new Set(verification.overrides.map((o) => o.findingId));
  const conflicts: VerificationGateConflict[] = [];

  for (const finding of verification.findings) {
    if (overriddenIds.has(finding.id)) continue;
    if (!isBlockingFinding(finding, detail.services)) continue;
    conflicts.push({
      findingId: finding.id,
      ...(finding.serviceId ? { serviceId: finding.serviceId } : {}),
      check: finding.check,
      detail: finding.detail,
    });
  }

  return conflicts;
}

export function assertVerificationCompleteForLock(
  detail: ArchitectureDetailDto,
  verification: VerificationRunWithFindings | null,
): asserts verification is VerificationRunWithFindings {
  if (!verification || verification.run.status !== "complete") {
    recordVerificationMetric("verification.gate_blocked", { reason: "no_complete_run" });
    throw ApiError.conflict(
      "No completed verification run for the current architecture version — run Verification Pass or retry",
    );
  }
  if (verification.run.version !== detail.version) {
    throw ApiError.conflict(
      "Verification run does not match the current architecture version",
    );
  }
}

export function assertLockGateClear(
  detail: ArchitectureDetailDto,
  verification: VerificationRunWithFindings,
): void {
  const conflicts = evaluateLockGate(detail, verification);
  if (conflicts.length > 0) {
    recordVerificationMetric("verification.gate_blocked", {
      reason: "unresolved_conflicts",
      count: String(conflicts.length),
    });
    throw new VerificationGateError(conflicts);
  }
}

export function overridesForBreakdown(
  overrides: VerificationOverride[],
): Array<{ findingId: string; reason: string }> {
  return overrides.map((o) => ({ findingId: o.findingId, reason: o.reason }));
}
