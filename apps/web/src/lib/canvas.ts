import type { ConfidenceTier, ConnectionKind } from "@architectai/config";
import {
  confidenceTierFromInputs,
  connectionKindFromProtocol,
} from "@architectai/config";
import type { VerificationVerdict } from "@architectai/shared";
import type { ArchitectureDetailResponse } from "@/lib/api";

export type { ConfidenceTier, ConnectionKind };

export function resolveServiceTier(
  service: ArchitectureDetailResponse["services"][number],
  issues: ArchitectureDetailResponse["governanceIssues"],
): ConfidenceTier {
  if (service.confidenceTier) return service.confidenceTier;
  const severities = issues
    .filter((i) => i.serviceId === service.id)
    .map((i) => i.severity);
  return confidenceTierFromInputs(service.confidenceScore, severities);
}

export function resolveConnectionKind(
  connection: ArchitectureDetailResponse["connections"][number],
): ConnectionKind {
  return connection.kind ?? connectionKindFromProtocol(connection.protocol);
}

export function buildCanvasEdges(
  connections: ArchitectureDetailResponse["connections"],
): { id: string; type: ConnectionKind }[] {
  return connections.map((c) => ({
    id: c.id,
    type: resolveConnectionKind(c),
  }));
}

export const TIER_NODE_CLASS: Record<ConfidenceTier, string> = {
  high: "node-tier-high border-status-green/60",
  partial: "node-tier-partial border-status-amber/60",
  critical: "node-tier-critical border-status-red/60",
};

/** Primary canvas border from verification rollup (rule 19 — conflict red, unverified amber). */
export const VERDICT_NODE_CLASS: Record<VerificationVerdict, string> = {
  verified: "node-verdict-verified border-status-green ring-1 ring-status-green/30",
  unverified: "node-verdict-unverified border-status-amber ring-1 ring-status-amber/30",
  conflict: "node-verdict-conflict border-status-red ring-2 ring-status-red/40",
};

export function verdictShowsAccessibilityBadge(verdict: VerificationVerdict): boolean {
  return verdict === "conflict" || verdict === "unverified";
}

export function verdictAccessibilityLabel(verdict: VerificationVerdict): string {
  if (verdict === "conflict") return "Conflict";
  if (verdict === "unverified") return "Unverified";
  return "Verified";
}

export function tierShowsAccessibilityIcon(tier: ConfidenceTier): boolean {
  return tier === "critical" || tier === "partial";
}
