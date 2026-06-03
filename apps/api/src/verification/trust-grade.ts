import { TRUST_GRADE_WEIGHTS } from "@architectai/config";
import type { TrustGradeBreakdown, TrustGradeDeduction } from "@architectai/shared";
import type { ArchServiceDto } from "@/services/architectures.service";
import type { Tier1Finding } from "@/verification/types";

export interface TrustGradeFinding {
  id?: string;
  serviceId?: string;
  verdict: Tier1Finding["verdict"];
  tier: Tier1Finding["tier"];
  detail: string;
}

export interface TrustGradeInput {
  findings: TrustGradeFinding[];
  services: ArchServiceDto[];
  overrides?: Array<{ findingId: string; reason: string }>;
}

/** Compute verification-only Trust Grade from findings (MVP slice). */
export function computeTrustGrade(input: TrustGradeInput): TrustGradeBreakdown {
  const overrides = input.overrides ?? [];
  const overriddenIds = new Set(overrides.map((o) => o.findingId));
  const active = input.findings.filter((f) => !f.id || !overriddenIds.has(f.id));

  const deductions: TrustGradeDeduction[] = [];
  let deterministicTotal = 0;
  let probabilisticTotal = 0;

  for (const finding of active) {
    if (finding.verdict === "conflict" && finding.tier === "deterministic") {
      const amount = TRUST_GRADE_WEIGHTS.deterministicConflict;
      deductions.push({
        kind: "deterministic_conflict",
        amount,
        detail: finding.detail,
        findingId: finding.id,
      });
      deterministicTotal += amount;
    } else if (finding.verdict === "unverified" && finding.tier === "deterministic") {
      const svc = input.services.find((s) => s.id === finding.serviceId);
      const isCritical =
        svc?.confidenceTier === "critical" || svc?.hasCriticalIssue === true;
      if (isCritical) {
        const amount = TRUST_GRADE_WEIGHTS.unverifiedCritical;
        deductions.push({
          kind: "unverified_critical",
          amount,
          detail: finding.detail,
          findingId: finding.id,
        });
        deterministicTotal += amount;
      }
    } else if (finding.tier === "probabilistic" && finding.verdict !== "verified") {
      probabilisticTotal += TRUST_GRADE_WEIGHTS.probabilisticFlag;
      deductions.push({
        kind: "probabilistic_flag",
        amount: TRUST_GRADE_WEIGHTS.probabilisticFlag,
        detail: finding.detail,
        findingId: finding.id,
      });
    }
  }

  const cappedProbabilistic = Math.min(
    probabilisticTotal,
    TRUST_GRADE_WEIGHTS.probabilisticCap,
  );
  const probabilisticOverCap = probabilisticTotal - cappedProbabilistic;
  if (probabilisticOverCap > 0) {
    deductions.push({
      kind: "probabilistic_flag",
      amount: -probabilisticOverCap,
      detail: `Probabilistic deduction capped at ${TRUST_GRADE_WEIGHTS.probabilisticCap}`,
    });
  }

  const verificationScore = Math.max(
    0,
    100 - deterministicTotal - cappedProbabilistic,
  );

  return {
    score: verificationScore,
    verificationScore,
    deductions,
    overrides,
  };
}
