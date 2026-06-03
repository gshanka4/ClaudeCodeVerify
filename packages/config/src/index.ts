/**
 * @architectai/config — cross-cutting configuration constants shared across
 * web, api, workers, and the extension. Values come from `new_architecture.md`
 * and `new_PRD.md` (latency budgets, rate limits, Redis key spaces).
 *
 * These are intentionally pure constants (no runtime deps) so any package can
 * import them without side effects.
 */

/** Latency budgets (ms) — product quality, hold in both lean and scale-up tiers. */
export const LATENCY_BUDGETS_MS = {
  /** Architecture generation, end-to-end P95. */
  generationP95: 30_000,
  /** Drift check (save -> response) P95 — deterministic hot path, no LLM. */
  driftCheckP95: 200,
  /** Drift alert (save -> WS alert). */
  driftAlert: 500,
} as const;

/** API rate limits (per `new_architecture.md §10`). */
export const RATE_LIMITS = {
  generatePerMinPerUser: 10,
  verifyPerMinPerUser: 10,
  driftPerMinPerWorkspace: 120,
  defaultPerMinPerUser: 300,
} as const;

/** Redis key-space templates (per `new_architecture.md §7.1`). */
export const REDIS_KEYS = {
  rateLimit: (scope: string, id: string) => `ratelimit:${scope}:${id}`,
  genStream: (architectureId: string) => `gen:stream:${architectureId}`,
  genState: (architectureId: string) => `gen:state:${architectureId}`,
  verifyStream: (runId: string) => `verify:stream:${runId}`,
  verifyState: (runId: string) => `verify:state:${runId}`,
  driftRuleIndex: (architectureId: string) => `drift:ruleidx:${architectureId}`,
  driftCache: (architectureId: string, fileHash: string) =>
    `drift:cache:${architectureId}:${fileHash}`,
  wsToken: (workspaceId: string) => `wstoken:${workspaceId}`,
} as const;

/** UX-A: generation overlay phase labels (static until LLM). */
export const GENERATION_PHASE_LABELS = {
  requirements: "Mapping requirements",
  services: "Generating services",
  contracts: "Emitting contracts",
  governance: "Applying governance rules",
  finalizing: "Finalizing architecture",
} as const;

export type GenerationPhaseKey = keyof typeof GENERATION_PHASE_LABELS;

/** UX-A: default inter-event delay when slow mode is on (ms total budget / events). */
export const GENERATION_SLOW_DEFAULT_MS = 8_000;

/** Default local-dev ports. */
export const DEFAULT_PORTS = {
  api: 4000,
  web: 5173,
  postgres: 5432,
  redis: 6379,
} as const;

/**
 * Interrogation bounds (per PRD §3 / `docs/01`).
 * Phase H: auto-generation starts after `maxQuestions` resolved (answered or skipped).
 */
export const INTERROGATION = {
  minQuestions: 3,
  maxQuestions: 3,
  minPromptChars: 20,
} as const;

/** UX-B: category order aligned with mock interrogation provider. */
export const INTERROGATION_CATEGORY_ORDER = [
  "scale",
  "security",
  "compliance",
  "cloud",
  "data",
  "messaging",
  "deployment",
  "migration",
] as const;

/** UX-B: static “why this question” helper per category (until LLM copy). */
export const INTERROGATION_CATEGORY_COPY: Record<
  (typeof INTERROGATION_CATEGORY_ORDER)[number],
  string
> = {
  scale: "Throughput and latency shape service boundaries, caching, and autoscaling.",
  security: "Trust boundaries drive authN/Z, secrets handling, and network segmentation.",
  compliance: "Regulatory scope determines audit logging, data residency, and controls.",
  cloud: "Deployment target affects HA patterns, managed services, and cost model.",
  data: "Ownership boundaries inform database-per-service vs shared stores.",
  messaging: "Event backbone choice impacts ordering, replay, and coupling.",
  deployment: "Delivery model drives GitOps, rollouts, and environment promotion.",
  migration: "Cutover strategy affects dual-write, strangler patterns, and risk.",
};

/** MVP export formats (terraform/pulumi deferred per PRD §11). */
export const MVP_EXPORT_FORMATS = [
  "claude-code-bundle",
  "cursor-config",
  "openapi",
  "adr-markdown",
] as const;
export type MvpExportFormat = (typeof MVP_EXPORT_FORMATS)[number];

export * from "./canvas";
export * from "./verification";
