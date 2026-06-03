import { useCallback, useEffect, useMemo, useState, type RefObject } from "react";
import { ArrowLeft, X } from "lucide-react";
import {
  Background,
  Controls,
  MiniMap,
  ReactFlow,
  type Edge,
  type Node,
  type NodeMouseHandler,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { collectCriticalGraphNodeIds } from "@architectai/shared";
import type { ArchitectureLineage } from "@architectai/shared";
import { LineageDecisionNode } from "@/components/workspace/lineage/LineageDecisionNode";
import { lineageEdgeTypes } from "@/components/workspace/lineage/LineageDecisionEdge";
import { LineageGraphLegend } from "@/components/workspace/lineage/LineageGraphLegend";
import { getArchitectureLineage, getLineageTopics } from "@/lib/api";
import {
  edgeLabel,
  filterSubgraph,
  getServiceTrace,
  layoutLineageNodes,
  traceNodeIds,
} from "@/lib/lineage-graph-layout";
import { useWorkspaceStore } from "@/stores/useWorkspaceStore";

interface Props {
  architectureId: string;
  onClose: () => void;
  closeButtonRef?: RefObject<HTMLButtonElement>;
}

const nodeTypes = { lineageDecision: LineageDecisionNode };

export function LineageGraphView({
  architectureId,
  onClose,
  closeButtonRef,
}: Props): JSX.Element {
  const [lineage, setLineage] = useState<ArchitectureLineage | null>(null);
  const [topicIds, setTopicIds] = useState<string[]>([]);
  const showAll = useWorkspaceStore((s) => s.lineageGraphShowAll);
  const setShowAll = useWorkspaceStore((s) => s.setLineageGraphShowAll);
  const setSelectedServiceId = useWorkspaceStore((s) => s.setSelectedServiceId);
  const setExpandedCriticalDecisionId = useWorkspaceStore(
    (s) => s.setExpandedCriticalDecisionId,
  );
  const selectedServiceId = useWorkspaceStore((s) => s.selectedServiceId);

  useEffect(() => {
    getArchitectureLineage(architectureId).then(setLineage).catch(() => setLineage(null));
    getLineageTopics(architectureId, selectedServiceId)
      .then((r) => setTopicIds(r.topics.map((t) => t.id)))
      .catch(() => setTopicIds([]));
  }, [architectureId, selectedServiceId]);

  const { nodes, edges, nodeCount, caption, filterMode } = useMemo(() => {
    if (!lineage) {
      return {
        nodes: [] as Node[],
        edges: [] as Edge[],
        nodeCount: 0,
        caption: "",
        filterMode: "service",
      };
    }

    let subgraphNodes = lineage.nodes;
    let subgraphEdges = lineage.edges;
    let focusPatternId: string | undefined;
    let captionText = "Causal provenance recorded at generation — follow arrows left-to-right.";
    let mode = "service";

    if (selectedServiceId && !showAll) {
      const trace = getServiceTrace(lineage, selectedServiceId);
      if (trace) {
        const ids = traceNodeIds(trace);
        const sub = filterSubgraph(lineage, ids);
        subgraphNodes = sub.nodes;
        subgraphEdges = sub.edges;
        focusPatternId = trace.selectedPatternNodeId;
        captionText = trace.summary;
        mode = "service";
      }
    } else if (!showAll && topicIds.length > 0) {
      const ids = collectCriticalGraphNodeIds(lineage, topicIds);
      const sub = filterSubgraph(lineage, ids);
      subgraphNodes = sub.nodes;
      subgraphEdges = sub.edges;
      captionText = "Top critical decisions — each path shows requirement → constraint → AI pattern choice.";
      mode = "critical";
    } else {
      captionText =
        "Full architecture decision lineage — select a canvas node to focus one component's provenance path.";
      mode = "all";
    }

    const positions = layoutLineageNodes(subgraphNodes, focusPatternId);
    const rfNodes: Node[] = subgraphNodes.map((n) => ({
      id: n.id,
      type: "lineageDecision",
      position: positions.get(n.id) ?? { x: 0, y: 0 },
      data: {
        label: n.label,
        type: n.type,
        detail: n.detail,
        nodeId: n.id,
        serviceId: n.serviceId,
        isFocus: n.id === focusPatternId,
        hasEvidence: Boolean(n.source),
        evidenceResolved: n.source ? Boolean(n.source.ref?.length) : undefined,
      },
    }));

    const rfEdges: Edge[] = subgraphEdges.map((e) => ({
      id: e.id,
      source: e.fromNodeId,
      target: e.toNodeId,
      type: "lineageDecision",
      label: edgeLabel(e),
      data: { edgeType: e.type },
    }));

    return {
      nodes: rfNodes,
      edges: rfEdges,
      nodeCount: subgraphNodes.length,
      caption: captionText,
      filterMode: mode,
    };
  }, [lineage, selectedServiceId, showAll, topicIds]);

  const onNodeClick: NodeMouseHandler = useCallback(
    (_e, node) => {
      const ln = lineage?.nodes.find((n) => n.id === node.id);
      const sid = ln?.serviceId ?? lineage?.traces.find((t) =>
        traceNodeIds(t).has(node.id),
      )?.serviceId;
      if (sid) {
        setSelectedServiceId(sid);
        setExpandedCriticalDecisionId(sid);
        setShowAll(false);
      }
    },
    [lineage, setSelectedServiceId, setExpandedCriticalDecisionId, setShowAll],
  );

  return (
    <div
      className="flex h-full min-h-0 flex-col bg-bg-base"
      data-testid="lineage-graph-view"
      data-lineage-node-count={nodeCount}
      data-lineage-filter={filterMode}
    >
      <header className="shrink-0 border-b border-border-muted px-4 py-2">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <button
              type="button"
              ref={closeButtonRef}
              className="flex items-center gap-1 rounded px-2 py-1 text-xs text-text-muted hover:bg-bg-elevated hover:text-text-primary"
              data-testid="lineage-graph-close"
              aria-label="Back to architecture canvas"
              onClick={onClose}
            >
              <ArrowLeft size={14} />
              Architecture
            </button>
            <h3 className="text-sm font-medium">Decision provenance graph</h3>
          </div>
          <div className="flex items-center gap-2">
            {selectedServiceId && showAll ? (
              <button
                type="button"
                className="text-xs text-brand-violet hover:underline"
                data-testid="lineage-graph-back-critical"
                onClick={() => setShowAll(false)}
              >
                Focus selected component
              </button>
            ) : selectedServiceId ? (
              <button
                type="button"
                className="text-xs text-text-muted hover:text-text-primary"
                data-testid="lineage-graph-show-all"
                onClick={() => setShowAll(true)}
              >
                Show full architecture
              </button>
            ) : (
              <button
                type="button"
                className="text-xs text-text-muted hover:text-text-primary"
                data-testid="lineage-graph-show-all"
                onClick={() => setShowAll(true)}
              >
                Show all nodes
              </button>
            )}
            <button
              type="button"
              className="rounded p-1 text-text-muted hover:bg-bg-elevated"
              data-testid="lineage-graph-close-icon"
              aria-label="Close provenance graph"
              onClick={onClose}
            >
              <X size={16} />
            </button>
          </div>
        </div>
        {selectedServiceId ? (
          <p className="mt-1 text-[10px] text-text-dim" data-testid="lineage-graph-service-hint">
            Showing provenance for selected component — decision trace stays in the right panel.
          </p>
        ) : null}
        {caption ? (
          <p
            className="mt-1 text-xs leading-relaxed text-text-secondary"
            data-testid="lineage-graph-caption"
          >
            {caption}
          </p>
        ) : null}
      </header>
      <div className="relative min-h-0 flex-1">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          edgeTypes={lineageEdgeTypes}
          onNodeClick={onNodeClick}
          fitView
          fitViewOptions={{ padding: 0.2 }}
          proOptions={{ hideAttribution: true }}
        >
          <Background color="#1f2333" gap={16} />
          <Controls showInteractive={false} />
          <MiniMap
            nodeColor={(n) => {
              const t = (n.data as { type?: string })?.type;
              if (t === "pattern") return "#22c55e";
              if (t === "requirement") return "#6366f1";
              return "#4a5578";
            }}
            maskColor="rgb(9 10 15 / 0.8)"
          />
        </ReactFlow>
        <LineageGraphLegend />
      </div>
    </div>
  );
}
