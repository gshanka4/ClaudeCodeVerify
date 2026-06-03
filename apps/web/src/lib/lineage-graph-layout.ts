import type {
  ArchitectureLineage,
  DecisionTrace,
  LineageEdge,
  LineageEdgeType,
  LineageNode,
  LineageNodeType,
} from "@architectai/shared";

/** Left-to-right causal columns for decision provenance. */
const TYPE_COLUMN: Record<LineageNodeType, number> = {
  requirement: 0,
  constraint: 1,
  alternative: 1,
  rule: 2,
  pattern: 3,
  contract: 4,
  assumption: 4,
  implication: 4,
  component: 5,
};

const COLUMN_WIDTH = 200;
const ROW_HEIGHT = 96;

export const LINEAGE_EDGE_STROKE: Record<LineageEdgeType, string> = {
  derives: "#6366f1",
  selects: "#22c55e",
  rejects: "#f59e0b",
  governs: "#ef4444",
  produces: "#06b6d4",
  impacts: "#64748b",
  assumes: "#94a3b8",
};

export function traceNodeIds(trace: DecisionTrace): Set<string> {
  const ids = new Set<string>();
  ids.add(trace.selectedPatternNodeId);
  for (const id of [
    ...trace.requirementNodeIds,
    ...trace.constraintNodeIds,
    ...trace.governanceRuleNodeIds,
    ...trace.contractNodeIds,
    ...trace.rejectedAlternativeNodeIds,
    ...trace.assumptionNodeIds,
    ...trace.downstreamImplicationNodeIds,
  ]) {
    if (id) ids.add(id);
  }
  return ids;
}

export function getServiceTrace(
  lineage: ArchitectureLineage,
  serviceId: string,
): DecisionTrace | undefined {
  return lineage.traces.find((t) => t.serviceId === serviceId);
}

export function filterSubgraph(
  lineage: ArchitectureLineage,
  nodeIds: Set<string>,
): { nodes: LineageNode[]; edges: LineageEdge[] } {
  const nodes = lineage.nodes.filter((n) => nodeIds.has(n.id));
  const idSet = new Set(nodes.map((n) => n.id));
  const edges = lineage.edges.filter(
    (e) => idSet.has(e.fromNodeId) && idSet.has(e.toNodeId),
  );
  return { nodes, edges };
}

export function layoutLineageNodes(
  nodes: LineageNode[],
  focusPatternNodeId?: string,
): Map<string, { x: number; y: number }> {
  const byColumn = new Map<number, LineageNode[]>();
  for (const node of nodes) {
    const col = TYPE_COLUMN[node.type] ?? 3;
    const list = byColumn.get(col) ?? [];
    list.push(node);
    byColumn.set(col, list);
  }

  const positions = new Map<string, { x: number; y: number }>();
  for (const [col, colNodes] of byColumn) {
    colNodes.forEach((node, row) => {
      positions.set(node.id, {
        x: col * COLUMN_WIDTH,
        y: row * ROW_HEIGHT,
      });
    });
  }

  if (focusPatternNodeId && positions.has(focusPatternNodeId)) {
    const pos = positions.get(focusPatternNodeId)!;
    positions.set(focusPatternNodeId, { x: pos.x, y: pos.y - 8 });
  }

  return positions;
}

export function edgeLabel(edge: LineageEdge): string {
  const verb =
    edge.type === "derives"
      ? "derives"
      : edge.type === "selects"
        ? "selects"
        : edge.type === "rejects"
          ? "rejects"
          : edge.type === "governs"
            ? "governs"
            : edge.type === "produces"
              ? "produces"
              : edge.type === "impacts"
                ? "impacts"
                : "assumes";
  const hint = edge.rationale?.trim();
  return hint ? `${verb}: ${hint}` : verb;
}
