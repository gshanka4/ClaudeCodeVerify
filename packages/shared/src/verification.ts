/**
 * Verification Pass types (spec delta D7 — `new_PRD_updated.md` §11).
 * Authoritative for the v3.0 verification subsystem; mirrored in `docs/04` OpenAPI.
 */

export type VerificationTier = "deterministic" | "probabilistic";

export type VerificationVerdict = "verified" | "unverified" | "conflict";

export type VerificationRunStatus = "running" | "complete" | "failed";

export type VerificationCheck =
  | "coverage.requirement"
  | "coverage.justification"
  | "structure.composition"
  | "structure.integrity"
  | "governance.conformance"
  | "constraint.satisfiability"
  | "adjudication.crossmodel"
  | "pattern.reference";

export type GroundTruthSourceKind =
  | "requirement"
  | "rule"
  | "capability-table"
  | "reference-corpus"
  | "cross-model";

export interface GroundTruthSource {
  kind: GroundTruthSourceKind;
  ref: string;
}

export interface VerificationRun {
  id: string;
  architectureId: string;
  version: number;
  status: VerificationRunStatus;
  trustGrade: number;
  /** Verifier engine + check versions for audit provenance. */
  engineVersions: Record<string, string>;
  startedAt: string;
  finishedAt?: string;
}

export interface VerificationFinding {
  id: string;
  runId: string;
  architectureId: string;
  serviceId?: string;
  lineageNodeId?: string;
  check: VerificationCheck;
  tier: VerificationTier;
  verdict: VerificationVerdict;
  /** 1.0 for deterministic checks. */
  confidence: number;
  groundTruthSource: GroundTruthSource;
  detail: string;
  evidenceRef?: string;
}

export interface VerificationOverride {
  id: string;
  findingId: string;
  architectureId: string;
  userId: string;
  reason: string;
  createdAt: string;
}

/** Rolled-up verdict for one architecture component (service). */
export interface ComponentVerdictRollup {
  serviceId: string;
  verdict: VerificationVerdict;
  findingIds: string[];
}

export type TrustGradeDeductionKind =
  | "deterministic_conflict"
  | "unverified_critical"
  | "probabilistic_flag"
  | "open_drift"
  | "override_recorded";

export interface TrustGradeDeduction {
  kind: TrustGradeDeductionKind;
  amount: number;
  detail: string;
  findingId?: string;
}

/** Trust Grade with transparent breakdown (PRD §9, UX rule 18). */
export interface TrustGradeBreakdown {
  score: number;
  /** Verification-time score before drift penalties (MVP). */
  verificationScore: number;
  /** Populated when drift→grade aggregation lands (VF). */
  driftPenalty?: number;
  deductions: TrustGradeDeduction[];
  overrides: Array<{ findingId: string; reason: string }>;
}

export interface VerificationSummary {
  run: VerificationRun;
  findings: VerificationFinding[];
  componentRollups: ComponentVerdictRollup[];
  trustGrade: TrustGradeBreakdown;
  overrides: VerificationOverride[];
}

/** API: trigger verification pass. */
export interface StartVerificationResponse {
  runId: string;
  streamUrl: string;
}

/** API: override a blocking finding. */
export interface RecordVerificationOverrideRequest {
  reason: string;
}

/** Lock gate failure (spec delta D9). */
export interface VerificationGateConflict {
  findingId: string;
  serviceId?: string;
  check: VerificationCheck;
  detail: string;
}

export interface VerificationGateFailedError {
  code: "verification_gate_failed";
  message: string;
  conflicts: VerificationGateConflict[];
}

/** Stamped into export manifest (D9 / FR-10). */
export interface VerificationManifestStamp {
  verificationRunId: string;
  trustGrade: number;
  trustGradeBreakdown: TrustGradeBreakdown;
  overrides: Array<{ findingId: string; reason: string; createdAt: string }>;
}

// ─── SSE stream events (D9 — `verification.*` prefix avoids generation collision) ─

export interface VerificationFindingEvent {
  finding: VerificationFinding;
}

export interface VerificationProgressEvent {
  checksComplete: number;
  checksTotal: number;
  tier: VerificationTier;
}

export interface VerificationCompleteEvent {
  runId: string;
  trustGrade: number;
  trustGradeBreakdown: TrustGradeBreakdown;
}

export type VerificationStreamEvent =
  | { type: "verification.finding"; payload: VerificationFindingEvent }
  | { type: "verification.progress"; payload: VerificationProgressEvent }
  | { type: "verification.complete"; payload: VerificationCompleteEvent }
  | { type: "verification.error"; payload: { message: string } };

/** Discriminant strings — used by V0 contract tests to enforce naming convention. */
export const VERIFICATION_STREAM_EVENT_TYPES = [
  "verification.finding",
  "verification.progress",
  "verification.complete",
  "verification.error",
] as const;

export type VerificationStreamEventType = (typeof VERIFICATION_STREAM_EVENT_TYPES)[number];

/** PRD §11 fixture shape — used by V0-EC-01 alignment tests. */
export const PRD_VERIFICATION_RUN_FIELDS = [
  "id",
  "architectureId",
  "version",
  "status",
  "trustGrade",
  "engineVersions",
  "startedAt",
  "finishedAt",
] as const;
