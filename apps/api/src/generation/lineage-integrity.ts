import type { DecisionTrace, LineageNode, LineageSource } from "@architectai/shared";

export interface ReferentialContext {
  /** Interrogation question UUIDs that may be cited. */
  interrogationRefs: Set<string>;
  /** Governance rule codes that may be cited. */
  ruleRefs: Set<string>;
}

export type IntegrityResult =
  | { ok: true; nodes: LineageNode[] }
  | { ok: false; reason: string; invalidRef: string };

export function resolveSource(source: LineageSource | undefined, ctx: ReferentialContext): boolean {
  if (!source) return true;
  if (source.kind === "interrogation") return ctx.interrogationRefs.has(source.ref);
  if (source.kind === "rule") return ctx.ruleRefs.has(source.ref);
  if (source.kind === "prd-span" || source.kind === "metric" || source.kind === "inference") {
    return source.ref.length > 0;
  }
  return false;
}

/**
 * P3-EC-01 — reject fabricated provenance: nodes with unresolvable `source.ref`
 * are stripped (never persisted as fact).
 */
export function sanitizeLineageNodes(
  nodes: LineageNode[],
  ctx: ReferentialContext,
): { nodes: LineageNode[]; strippedRefs: string[] } {
  const strippedRefs: string[] = [];
  const sanitized = nodes.map((node) => {
    if (!node.source) return node;
    if (resolveSource(node.source, ctx)) return node;
    strippedRefs.push(node.source.ref);
    const { source: _s, ...rest } = node;
    return { ...rest, source: undefined };
  });
  return { nodes: sanitized, strippedRefs };
}

/** P3-EC-02 — every component trace must cite at least one requirement and contract. */
export function validateTraceCompleteness(trace: DecisionTrace): IntegrityResult {
  if (trace.requirementNodeIds.length === 0) {
    return { ok: false, reason: "missing_requirement", invalidRef: trace.serviceId };
  }
  if (trace.contractNodeIds.length === 0) {
    return { ok: false, reason: "missing_contract", invalidRef: trace.serviceId };
  }
  return { ok: true, nodes: [] };
}
