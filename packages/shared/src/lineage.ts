/**
 * Decision Lineage — Provenance Engine types (spec delta D3).
 *
 * A per-architecture lineage graph (typed nodes + causal edges) plus a
 * per-component Decision Trace (a rooted slice of that graph). Captured at
 * generation time, persisted, and queryable. See `new_architecture.md`
 * (Decision Provenance Engine) and `new_PRD.md §6A`.
 */

export type LineageNodeType =
  | "requirement" // from an interrogation answer or input-PRD span
  | "constraint" // inferred constraint (e.g. P95 latency threshold)
  | "pattern" // the selected pattern/technology (maps to the component)
  | "alternative" // a rejected alternative
  | "rule" // governance rule that influenced/overrode the choice
  | "contract" // resulting service contract
  | "component" // the architecture service node
  | "assumption" // an inferred assumption
  | "implication"; // downstream implication

export type LineageEdgeType =
  | "derives" // requirement → constraint
  | "selects" // constraint → pattern (chosen)
  | "rejects" // pattern ↔ alternative (with reason)
  | "governs" // rule → pattern (preferred / required / overrode-alternative)
  | "produces" // pattern/component → contract
  | "impacts" // component → downstream component / implication
  | "assumes"; // pattern → assumption

export type LineageSourceKind = "interrogation" | "prd-span" | "rule" | "metric" | "inference";

export interface LineageSource {
  kind: LineageSourceKind;
  /** Reference to the originating record (interrogation answer id, rule code, …).
   *  Server-side referential-integrity check must resolve this (no fabricated provenance). */
  ref: string;
  confidence: number; // 0–100
}

export interface LineageNode {
  id: string;
  type: LineageNodeType;
  label: string;
  detail: string;
  /** Present for evidence-bearing nodes (requirement/constraint/rule/…). */
  source?: LineageSource;
  /** Binds a `component`-type node to its canvas service. */
  serviceId?: string;
}

export interface LineageEdge {
  id: string;
  fromNodeId: string;
  toNodeId: string;
  type: LineageEdgeType;
  rationale: string;
}

/** One per component (service). */
export interface DecisionTrace {
  serviceId: string;
  summary: string; // "Chosen because…"
  requirementNodeIds: string[];
  constraintNodeIds: string[];
  selectedPatternNodeId: string;
  rejectedAlternativeNodeIds: string[];
  governanceRuleNodeIds: string[];
  contractNodeIds: string[];
  downstreamImplicationNodeIds: string[];
  assumptionNodeIds: string[];
  confidence: number; // 0–100
}

export interface ArchitectureLineage {
  architectureId: string;
  nodes: LineageNode[];
  edges: LineageEdge[];
  traces: DecisionTrace[];
}

/** Lineage node with server-side resolution flag (P4-EC-01). */
export interface ResolvedLineageNode extends LineageNode {
  /** `false` when `source.ref` did not resolve — UI must flag, not show as fact. */
  sourceResolved: boolean;
}

export type TraceChainStepType =
  | "requirement"
  | "constraint"
  | "pattern"
  | "alternative"
  | "rule"
  | "contract"
  | "implication"
  | "assumption";

/** One expandable step in the Decision Trace causal chain (Screen 4). */
export interface TraceChainStep {
  stepType: TraceChainStepType;
  label: string;
  nodes: ResolvedLineageNode[];
  /** Shown when a step has no nodes (P4-EC-04/05). */
  emptyMessage?: string;
}

/** Resolved trace for `GET …/services/{serviceId}/trace` (spec delta D5). */
export interface ResolvedDecisionTrace {
  serviceId: string;
  summary: string;
  confidence: number;
  chain: TraceChainStep[];
  unresolvedNodeIds: string[];
  /** Readable AI reasoning prose (Phase F lineage surfacing). */
  narrative?: string;
  /** User refinements from decision-lineage chat. */
  userDecisionNote?: string;
}

export interface DecisionLineageChatRequest {
  message: string;
}

export interface DecisionLineageChatResponse {
  reply: string;
  trace: ResolvedDecisionTrace;
}

export interface LockArchitectureResponse {
  architectureId: string;
  version: number;
  lockedAt: string;
}

export interface AskArchitectureRequest {
  question: string;
}

export interface AskArchitectureResponse {
  answer: string;
  groundedInLineage: boolean;
}

/** Ranked critical decision for Phase F (REQ-9). */
export type CriticalDecisionSeverity = "critical" | "high" | "medium";

export type CriticalDecisionStepType = "pattern" | "rule" | "contract" | "constraint";

export interface CriticalDecisionTopic {
  id: string;
  serviceId: string | null;
  title: string;
  severity: CriticalDecisionSeverity;
  stepType: CriticalDecisionStepType;
  summary: string;
  chosenBecause: string[];
  hasUnresolvedProvenance: boolean;
  contractIds: string[];
}

export interface LineageTopicsResponse {
  topics: CriticalDecisionTopic[];
}

export interface DecisionChainStepDetail {
  kind: TraceChainStepType;
  label: string;
  detail: string;
  source?: { kind: string; ref: string; confidence: number; resolved: boolean };
  rejected?: boolean;
}

export interface DecisionChainResponse {
  topicId: string;
  serviceId: string;
  steps: DecisionChainStepDetail[];
}

export const LINEAGE_NODE_TYPES = [
  "requirement",
  "constraint",
  "pattern",
  "alternative",
  "rule",
  "contract",
  "component",
  "assumption",
  "implication",
] as const satisfies readonly LineageNodeType[];

/** Node ids for top critical topics + 1-hop neighbors (Phase F graph filter). */
export function collectCriticalGraphNodeIds(
  lineage: ArchitectureLineage,
  topicIds: string[],
): Set<string> {
  const traceByService = new Map(lineage.traces.map((t) => [t.serviceId, t]));
  const seed = new Set<string>();
  for (const topicId of topicIds) {
    const trace = traceByService.get(topicId) ?? lineage.traces.find((t) => t.serviceId === topicId);
    if (!trace) continue;
    seed.add(trace.selectedPatternNodeId);
    for (const id of [
      ...trace.requirementNodeIds,
      ...trace.constraintNodeIds,
      ...trace.governanceRuleNodeIds,
      ...trace.contractNodeIds,
      ...trace.rejectedAlternativeNodeIds,
      ...trace.assumptionNodeIds,
      ...trace.downstreamImplicationNodeIds,
    ]) {
      seed.add(id);
    }
  }
  const expanded = new Set(seed);
  for (const edge of lineage.edges) {
    if (seed.has(edge.fromNodeId)) expanded.add(edge.toNodeId);
    if (seed.has(edge.toNodeId)) expanded.add(edge.fromNodeId);
  }
  return expanded;
}

export const LINEAGE_EDGE_TYPES = [
  "derives",
  "selects",
  "rejects",
  "governs",
  "produces",
  "impacts",
  "assumes",
] as const satisfies readonly LineageEdgeType[];
