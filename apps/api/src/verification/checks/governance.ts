import {
  buildArchitectureGraph,
  evaluateGraphRules,
} from "@/verification/architecture-graph";
import type { Tier1FindingDraft, VerificationContext } from "@/verification/types";

/** Evaluates active governance rules against the architecture graph. */
export function checkGovernanceConformance(ctx: VerificationContext): Tier1FindingDraft[] {
  const enabledRules = ctx.rules.filter((r) => r.enabled);

  if (enabledRules.length === 0) {
    return [
      {
        architectureId: ctx.architectureId,
        check: "governance.conformance",
        tier: "deterministic",
        verdict: "verified",
        confidence: 1,
        groundTruthSource: { kind: "rule", ref: "ruleset:empty" },
        detail: "No enabled governance rules — conformance vacuously satisfied",
      },
    ];
  }

  const graph = buildArchitectureGraph(ctx.services, ctx.connections);
  const violations = evaluateGraphRules(graph, ctx.rules);

  if (violations.length === 0) {
    return [
      {
        architectureId: ctx.architectureId,
        check: "governance.conformance",
        tier: "deterministic",
        verdict: "verified",
        confidence: 1,
        groundTruthSource: { kind: "rule", ref: "ruleset:pass" },
        detail: `Architecture satisfies all ${enabledRules.length} enabled governance rules`,
      },
    ];
  }

  return violations.map((v) => ({
    architectureId: ctx.architectureId,
    serviceId: v.serviceId,
    check: "governance.conformance" as const,
    tier: "deterministic" as const,
    verdict: "conflict" as const,
    confidence: 1 as const,
    groundTruthSource: { kind: "rule" as const, ref: v.rule.code },
    detail: v.message,
    evidenceRef: v.connectionId,
  }));
}
