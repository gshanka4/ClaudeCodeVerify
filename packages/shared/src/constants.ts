/**
 * Runtime constant arrays mirroring the string-literal unions in `types.ts`.
 * These give us a single source for validation (Zod enums later) and provide
 * importable runtime values (the type-only module would otherwise be empty).
 */
import type {
  ArchitectureStatus,
  DriftSeverity,
  LayerType,
  RuleSeverity,
  RuleType,
  UserRole,
} from "./types";

export const USER_ROLES = [
  "owner",
  "architect",
  "developer",
  "governance_lead",
  "viewer",
] as const satisfies readonly UserRole[];

export const ARCHITECTURE_STATUSES = [
  "interrogating",
  "generating",
  "ready",
  "draft",
  "archived",
] as const satisfies readonly ArchitectureStatus[];

export const LAYER_TYPES = [
  "gateway",
  "security",
  "services",
  "cache",
  "messaging",
  "database",
  "ml",
  "storage",
  "observability",
] as const satisfies readonly LayerType[];

export const RULE_TYPES = [
  "boundary",
  "auth",
  "pattern",
  "naming",
  "contract",
  "dependency",
] as const satisfies readonly RuleType[];

export const RULE_SEVERITIES = [
  "critical",
  "high",
  "medium",
  "low",
  "info",
] as const satisfies readonly RuleSeverity[];

export const DRIFT_SEVERITIES = [
  "critical",
  "high",
  "medium",
  "low",
] as const satisfies readonly DriftSeverity[];

/** The status that is exportable. "Locked" reuses `ready` (no new state). */
export const EXPORTABLE_STATUS: ArchitectureStatus = "ready";
