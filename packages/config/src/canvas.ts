/** Confidence tier thresholds (REQ-5, Phase D). */
export const CONFIDENCE_TIER_HIGH = 80;
export const CONFIDENCE_TIER_PARTIAL = 50;

export type ConfidenceTier = "high" | "partial" | "critical";

export const CONNECTION_KINDS = ["sync", "async", "event", "dependency"] as const;
export type ConnectionKind = (typeof CONNECTION_KINDS)[number];

const BLOCKING_SEVERITIES = new Set(["critical", "high"]);

/** True when the service has an open critical or high governance issue. */
export function serviceHasBlockingIssue(severities: readonly string[]): boolean {
  return severities.some((s) => BLOCKING_SEVERITIES.has(s));
}

/**
 * Resolve visual tier: blocking issues override score (REQ-5).
 * Score ≥ HIGH → green; ≥ PARTIAL → yellow; else muted partial band.
 */
export function confidenceTierFromInputs(
  score: number,
  issueSeverities: readonly string[],
): ConfidenceTier {
  if (serviceHasBlockingIssue(issueSeverities)) return "critical";
  if (score >= CONFIDENCE_TIER_HIGH) return "high";
  if (score >= CONFIDENCE_TIER_PARTIAL) return "partial";
  return "partial";
}

/** Infer edge kind from connection protocol for canvas styling (REQ-6). */
export function connectionKindFromProtocol(protocol: string): ConnectionKind {
  const p = protocol.toUpperCase();
  if (p === "KAFKA") return "event";
  if (p === "AMQP" || p === "WEBSOCKET") return "async";
  if (p === "INTERNAL") return "dependency";
  return "sync";
}
