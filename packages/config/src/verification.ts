/**
 * Verification Pass configuration (spec delta D7 — weights, checks, gate threshold).
 * @see `new_PRD_updated.md` §9, §14, open questions §19
 */

/** All verification check IDs (MVP + fast-follow). Must be unique — V0-EC-04. */
export const VERIFICATION_CHECKS = [
  "coverage.requirement",
  "coverage.justification",
  "structure.composition",
  "structure.integrity",
  "governance.conformance",
  "constraint.satisfiability",
  "adjudication.crossmodel",
  "pattern.reference",
] as const;

export type VerificationCheckId = (typeof VERIFICATION_CHECKS)[number];

/** Tier-1 deterministic checks shipped in verification v1 MVP. */
export const DETERMINISTIC_VERIFICATION_CHECKS = [
  "coverage.requirement",
  "coverage.justification",
  "structure.composition",
  "structure.integrity",
  "governance.conformance",
] as const satisfies readonly VerificationCheckId[];

/** Tier-2 probabilistic checks (MVP: cross-model only). */
export const PROBABILISTIC_VERIFICATION_CHECKS = [
  "adjudication.crossmodel",
] as const satisfies readonly VerificationCheckId[];

/** Fast-follow deterministic check (VF). */
export const FAST_FOLLOW_DETERMINISTIC_CHECKS = [
  "constraint.satisfiability",
] as const satisfies readonly VerificationCheckId[];

/** Fast-follow probabilistic check (VF). */
export const FAST_FOLLOW_PROBABILISTIC_CHECKS = [
  "pattern.reference",
] as const satisfies readonly VerificationCheckId[];

/**
 * Trust Grade deduction weights (open question #1 — defaults until user tuning).
 * Score starts at 100; deductions applied per finding rollup.
 */
export const TRUST_GRADE_WEIGHTS = {
  deterministicConflict: 25,
  unverifiedCritical: 10,
  probabilisticFlag: 3,
  /** Max total deduction from probabilistic flags per architecture. */
  probabilisticCap: 15,
} as const;

export type TrustGradeWeights = typeof TRUST_GRADE_WEIGHTS;

/**
 * Components at or above this criticality block Lock on unresolved deterministic conflicts.
 * Reuses canvas tier inputs: `confidenceTier === "critical"` OR `hasCriticalIssue`.
 */
export const LOCK_GATE_CRITICALITY = {
  blockOnConfidenceTier: "critical" as const,
  blockOnHasCriticalIssue: true,
} as const;

/** Latency budgets for verification (PRD §13). */
export const VERIFICATION_LATENCY_BUDGETS_MS = {
  tier1DeterministicP95: 2_000,
  fullPassP95: 20_000,
  lockGateEvaluation: 100,
} as const;

/** Tier-2 cross-model adjudication limits (Phase V5). */
export const TIER2_CROSSMODEL = {
  batchSize: 5,
  tokenBudgetPerRun: 50_000,
  timeoutMs: 5_000,
  maxRetries: 2,
} as const;

/** Rate limit: verify requests per user per minute (same order as generation). */
export const VERIFICATION_RATE_LIMIT_PER_MIN = 10;

export class VerificationConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "VerificationConfigError";
  }
}

/** V0-EC-04 — duplicate check IDs fail at module load / boot validation. */
export function assertUniqueVerificationChecks(
  checks: readonly string[] = VERIFICATION_CHECKS,
): void {
  const seen = new Set<string>();
  for (const id of checks) {
    if (seen.has(id)) {
      throw new VerificationConfigError(`Duplicate verification check id: ${id}`);
    }
    seen.add(id);
  }
}

/**
 * V0-EC-03 — reject weight configs that cannot produce a valid 0–100 score envelope.
 * Ensures individual weights are positive, capped, and worst-case single-category
 * deduction does not exceed 100.
 */
export function validateTrustGradeWeights(
  weights: TrustGradeWeights = TRUST_GRADE_WEIGHTS,
): void {
  const entries: Array<[string, number]> = [
    ["deterministicConflict", weights.deterministicConflict],
    ["unverifiedCritical", weights.unverifiedCritical],
    ["probabilisticFlag", weights.probabilisticFlag],
    ["probabilisticCap", weights.probabilisticCap],
  ];

  for (const [name, value] of entries) {
    if (!Number.isFinite(value) || value < 0) {
      throw new VerificationConfigError(`Trust grade weight ${name} must be a non-negative number`);
    }
    if (value > 100) {
      throw new VerificationConfigError(`Trust grade weight ${name} must not exceed 100`);
    }
  }

  if (weights.probabilisticCap < weights.probabilisticFlag) {
    throw new VerificationConfigError(
      "probabilisticCap must be >= probabilisticFlag (cap is meaningless otherwise)",
    );
  }

  // A single deterministic conflict must not zero the score below 0 by itself.
  if (weights.deterministicConflict > 100) {
    throw new VerificationConfigError("deterministicConflict weight exceeds maximum score");
  }
}

/** Minimum achievable Trust Grade given weights (floor is 0 after clamping in V2). */
export function trustGradeScoreFloor(weights: TrustGradeWeights = TRUST_GRADE_WEIGHTS): number {
  return Math.max(0, 100 - weights.deterministicConflict);
}

/** Run all boot-time verification config validations. */
export function validateVerificationConfig(): void {
  assertUniqueVerificationChecks(VERIFICATION_CHECKS);
  validateTrustGradeWeights(TRUST_GRADE_WEIGHTS);
}

// Fail fast on invalid static config (V0-EC-03, V0-EC-04).
validateVerificationConfig();
