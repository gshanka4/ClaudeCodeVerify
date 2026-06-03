import type {
  ArchitectureLineage,
  CriticalDecisionSeverity,
  CriticalDecisionStepType,
  CriticalDecisionTopic,
  DecisionTrace,
} from "@architectai/shared";

export interface RankInput {
  lineage: ArchitectureLineage;
  issues: Array<{ severity: string; serviceId: string; message: string }>;
  confidenceScore: number;
  serviceIdFilter?: string | null;
  limit?: number;
  /** Node ids whose source.ref failed referential resolution (from lineage-read). */
  unresolvedNodeIds?: Set<string>;
}

const SEVERITY_ORDER: Record<CriticalDecisionSeverity, number> = {
  critical: 0,
  high: 1,
  medium: 2,
};

function severityRank(s: CriticalDecisionSeverity): number {
  return SEVERITY_ORDER[s];
}

function traceServiceId(trace: DecisionTrace, nodes: ArchitectureLineage["nodes"]): string {
  const pattern = nodes.find((n) => n.id === trace.selectedPatternNodeId);
  return pattern?.serviceId ?? trace.serviceId;
}

function chosenBecauseBullets(trace: DecisionTrace, nodes: ArchitectureLineage["nodes"]): string[] {
  const bullets: string[] = [];
  for (const id of trace.requirementNodeIds) {
    const n = nodes.find((x) => x.id === id);
    if (n) bullets.push(`Requirement: ${n.label}`);
  }
  for (const id of trace.constraintNodeIds) {
    const n = nodes.find((x) => x.id === id);
    if (n) bullets.push(`Constraint: ${n.label}`);
  }
  for (const id of trace.governanceRuleNodeIds) {
    const n = nodes.find((x) => x.id === id);
    if (n) bullets.push(`Rule ${n.label} applied`);
  }
  if (bullets.length === 0 && trace.summary) bullets.push(trace.summary);
  return bullets.slice(0, 3);
}

function hasUnresolved(trace: DecisionTrace, unresolvedIds: Set<string>): boolean {
  const ids = [
    ...trace.requirementNodeIds,
    ...trace.constraintNodeIds,
    trace.selectedPatternNodeId,
    ...trace.governanceRuleNodeIds,
    ...trace.contractNodeIds,
  ].filter(Boolean) as string[];
  return ids.some((id) => unresolvedIds.has(id));
}

function governsEdgeRationale(lineage: ArchitectureLineage, ruleNodeId: string): boolean {
  return lineage.edges.some(
    (e) => e.fromNodeId === ruleNodeId && e.type === "governs" && /overrode|override|prefer/i.test(e.rationale),
  );
}

export function rankCriticalDecisions(input: RankInput): CriticalDecisionTopic[] {
  const limit = input.limit ?? 5;
  const nodeById = new Map(input.lineage.nodes.map((n) => [n.id, n]));
  const unresolved =
    input.unresolvedNodeIds ??
    new Set(
      input.lineage.nodes
        .filter((n) => n.source && !n.source.ref)
        .map((n) => n.id),
    );

  const topics: Array<CriticalDecisionTopic & { score: number }> = [];

  for (const trace of input.lineage.traces) {
    const sid = traceServiceId(trace, input.lineage.nodes);
    if (input.serviceIdFilter && sid !== input.serviceIdFilter) continue;

    let score = 0;
    const criticalIssue = input.issues.find(
      (i) => i.serviceId === sid && (i.severity === "critical" || i.severity === "high"),
    );
    if (criticalIssue?.severity === "critical") score += 100;
    else if (criticalIssue?.severity === "high") score += 80;

    if (hasUnresolved(trace, unresolved)) score += 80;

    for (const ruleId of trace.governanceRuleNodeIds) {
      if (governsEdgeRationale(input.lineage, ruleId)) score += 60;
      else score += 30;
    }

    if (trace.contractNodeIds.length > 0) score += 50;

    if (trace.rejectedAlternativeNodeIds.length > 0) score += 40;

    if (input.serviceIdFilter && sid === input.serviceIdFilter) score += 20;

    score += Math.round((input.confidenceScore / 100) * 30);

    const patternNode = nodeById.get(trace.selectedPatternNodeId);
    const title = patternNode?.label ?? trace.summary.slice(0, 48);
    let stepType: CriticalDecisionStepType = "pattern";
    if (trace.contractNodeIds.length > 0 && trace.governanceRuleNodeIds.length === 0) stepType = "contract";
    else if (trace.governanceRuleNodeIds.length > 0) stepType = "rule";
    else if (trace.constraintNodeIds.length > trace.requirementNodeIds.length) stepType = "constraint";

    let severity: CriticalDecisionSeverity = "medium";
    if (criticalIssue?.severity === "critical" || hasUnresolved(trace, unresolved)) {
      severity = "critical";
    } else if (criticalIssue || score >= 90) severity = "high";

    topics.push({
      id: trace.serviceId,
      serviceId: sid,
      title,
      severity,
      stepType,
      summary: trace.summary,
      chosenBecause: chosenBecauseBullets(trace, input.lineage.nodes),
      hasUnresolvedProvenance: hasUnresolved(trace, unresolved),
      contractIds: trace.contractNodeIds
        .map((cid) => {
          const cn = nodeById.get(cid);
          return cn?.source?.ref?.startsWith("contract-row-")
            ? cn.source.ref.replace("contract-row-", "")
            : null;
        })
        .filter((x): x is string => !!x),
      score,
    });
  }

  topics.sort(
    (a, b) =>
      b.score - a.score ||
      severityRank(a.severity) - severityRank(b.severity) ||
      a.title.localeCompare(b.title),
  );

  if (input.serviceIdFilter) {
    return topics.slice(0, limit).map(({ score: _s, ...t }) => t);
  }

  const seen = new Set<string>();
  const out: CriticalDecisionTopic[] = [];
  for (const t of topics) {
    if (seen.has(t.serviceId ?? t.id)) continue;
    seen.add(t.serviceId ?? t.id);
    const { score: _s, ...rest } = t;
    out.push(rest);
    if (out.length >= limit) break;
  }
  return out;
}
