import { AlertCircle } from "lucide-react";
import { useCallback, useMemo, useState } from "react";
import {
  Background,
  Controls,
  Handle,
  MiniMap,
  Position,
  ReactFlow,
  type Edge,
  type Node,
  type NodeMouseHandler,
  type OnInit,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { canvasEdgeTypes } from "@/components/workspace/canvas/CanvasEdges";
import { CanvasLegend } from "@/components/workspace/canvas/CanvasLegend";
import { Swimlanes } from "@/components/workspace/canvas/Swimlanes";
import type { ArchitectureDetailResponse } from "@/lib/api";
import {
  resolveConnectionKind,
  resolveServiceTier,
  TIER_NODE_CLASS,
  VERDICT_NODE_CLASS,
  verdictAccessibilityLabel,
  verdictShowsAccessibilityBadge,
  tierShowsAccessibilityIcon,
  type ConfidenceTier,
} from "@/lib/canvas";
import type { VerificationVerdict } from "@architectai/shared";
import { useWorkspaceStore } from "@/stores/useWorkspaceStore";

interface Props {
  detail: ArchitectureDetailResponse;
}

interface ServiceNodeData {
  serviceId: string;
  label: string;
  layer: string;
  confidence: number;
  tier: ConfidenceTier;
  verdict?: VerificationVerdict;
  verdictLoading?: boolean;
  showTierIcon: boolean;
  showVerdictBadge: boolean;
}

function ServiceNode({ data }: { data: ServiceNodeData }): JSX.Element {
  const borderClass =
    data.verdictLoading || !data.verdict
      ? "border-border-muted"
      : VERDICT_NODE_CLASS[data.verdict];
  const tierClass = data.verdict && !data.verdictLoading ? "opacity-90" : TIER_NODE_CLASS[data.tier];

  return (
    <div
      className={`relative h-[72px] w-[140px] rounded-xl border-2 bg-bg-panel px-2 py-1.5 text-xs shadow-sm ${borderClass} ${tierClass}`}
      data-testid={`workspace-node-${data.serviceId}`}
      data-tier={data.tier}
      data-verdict={data.verdict ?? "loading"}
    >
      <Handle type="target" position={Position.Top} className="!h-2 !w-2 !border-border-muted !bg-bg-elevated" />
      <Handle type="source" position={Position.Bottom} className="!h-2 !w-2 !border-border-muted !bg-bg-elevated" />
      {data.showVerdictBadge && data.verdict ? (
        <span
          className={`absolute right-1 top-1 z-10 rounded px-1 text-[9px] font-medium leading-none ${
            data.verdict === "conflict"
              ? "bg-status-red/20 text-status-red"
              : "bg-status-amber/20 text-status-amber"
          }`}
          data-testid={`workspace-node-verdict-badge-${data.serviceId}`}
          aria-label={verdictAccessibilityLabel(data.verdict)}
        >
          {data.verdict === "conflict" ? "❌" : "⚠"}
        </span>
      ) : null}
      {data.showTierIcon ? (
        <AlertCircle
          size={14}
          className={`absolute bottom-1 right-1 ${
            data.tier === "critical" ? "text-status-red" : "text-status-amber"
          }`}
          data-testid={`workspace-node-tier-icon-${data.serviceId}`}
          aria-hidden
        />
      ) : null}
      <span className="block pr-5 text-[10px] uppercase text-text-ghost">{data.layer}</span>
      <p className="truncate pr-5 font-medium text-text-primary">{data.label}</p>
      <p className="text-text-dim">{data.confidence}%</p>
    </div>
  );
}

const nodeTypes = { service: ServiceNode };

export function ArchitectureCanvas({ detail }: Props): JSX.Element {
  const setSelectedServiceId = useWorkspaceStore((s) => s.setSelectedServiceId);
  const selectedServiceId = useWorkspaceStore((s) => s.selectedServiceId);
  const focusMode = useWorkspaceStore((s) => s.focusMode);
  const componentVerdicts = useWorkspaceStore((s) => s.componentVerdicts);
  const verificationLoading = useWorkspaceStore((s) => s.verificationLoading);
  const [edgeTooltip, setEdgeTooltip] = useState<{
    protocol: string;
    kind: string;
    x: number;
    y: number;
  } | null>(null);

  const nodes: Node[] = useMemo(
    () =>
      detail.services.map((s) => {
        const tier = resolveServiceTier(s, detail.governanceIssues);
        const verdict = componentVerdicts[s.id];
        return {
          id: s.id,
          type: "service",
          position: { x: s.position.x, y: s.position.y },
          data: {
            serviceId: s.id,
            label: s.displayName,
            layer: s.layer,
            confidence: s.confidenceScore,
            tier,
            verdict,
            verdictLoading: verificationLoading && !verdict,
            showTierIcon: tierShowsAccessibilityIcon(tier),
            showVerdictBadge: verdict ? verdictShowsAccessibilityBadge(verdict) : false,
          } satisfies ServiceNodeData,
          selected: s.id === selectedServiceId,
          style:
            focusMode && s.id !== selectedServiceId
              ? { opacity: 0.35 }
              : undefined,
        };
      }),
    [detail.services, detail.governanceIssues, selectedServiceId, focusMode, componentVerdicts, verificationLoading],
  );

  const edges: Edge[] = useMemo(
    () =>
      detail.connections.map((c) => {
        const kind = resolveConnectionKind(c);
        return {
          id: c.id,
          source: c.fromServiceId,
          target: c.toServiceId,
          type: kind,
          data: { kind, protocol: c.protocol },
        };
      }),
    [detail.connections],
  );

  const onNodeClick: NodeMouseHandler = useCallback(
    (_e, node) => {
      setSelectedServiceId(node.id);
    },
    [setSelectedServiceId],
  );

  const onInit: OnInit = useCallback((instance) => {
    void instance.fitView({ padding: 0.2, duration: 200 });
  }, []);

  return (
    <div
      className="relative h-full w-full"
      data-testid="workspace-canvas"
      data-connection-count={detail.connections.length}
    >
      <Swimlanes layers={detail.layers} />
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        edgeTypes={canvasEdgeTypes}
        onNodeClick={onNodeClick}
        onInit={onInit}
        onEdgeClick={(e, edge) => {
          const rect = (e.target as HTMLElement).getBoundingClientRect();
          const kind = (edge.data?.kind as string) ?? "sync";
          const protocol = (edge.data?.protocol as string) ?? edge.label ?? "";
          setEdgeTooltip({
            protocol: String(protocol),
            kind,
            x: rect.left + rect.width / 2,
            y: rect.top,
          });
        }}
        onPaneClick={() => setEdgeTooltip(null)}
        minZoom={0.4}
        maxZoom={1.5}
        proOptions={{ hideAttribution: true }}
      >
        <Background color="#1f2333" gap={20} />
        <Controls showInteractive={false} />
        <MiniMap
          className="!bg-bg-panel !border-border-muted"
          maskColor="rgba(9, 10, 15, 0.75)"
          nodeColor={(n) => {
            const tier = (n.data as { tier?: ConfidenceTier } | undefined)?.tier;
            if (tier === "critical") return "#ef4444";
            if (tier === "partial") return "#f59e0b";
            return "#10b981";
          }}
        />
      </ReactFlow>
      <CanvasLegend />
      {edgeTooltip ? (
        <div
          className="pointer-events-none fixed z-50 -translate-x-1/2 -translate-y-full rounded-md border border-border-muted bg-bg-panel px-2 py-1 text-xs text-text-secondary shadow-lg"
          style={{ left: edgeTooltip.x, top: edgeTooltip.y - 8 }}
          data-testid="canvas-edge-tooltip"
        >
          {edgeTooltip.protocol} · {edgeTooltip.kind}
        </div>
      ) : null}
    </div>
  );
}
