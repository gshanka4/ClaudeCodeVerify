import {
  BaseEdge,
  EdgeLabelRenderer,
  getBezierPath,
  MarkerType,
  type EdgeProps,
} from "@xyflow/react";
import type { LineageEdgeType } from "@architectai/shared";
import { LINEAGE_EDGE_STROKE } from "@/lib/lineage-graph-layout";

export function LineageDecisionEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  data,
  label,
}: EdgeProps): JSX.Element {
  const edgeType = (data?.edgeType as LineageEdgeType) ?? "derives";
  const stroke = LINEAGE_EDGE_STROKE[edgeType] ?? "#64748b";
  const dashed = edgeType === "rejects" || edgeType === "assumes";
  const [path, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });

  return (
    <>
      <BaseEdge
        id={id}
        path={path}
        markerEnd={MarkerType.ArrowClosed}
        style={{
          stroke,
          strokeWidth: edgeType === "governs" ? 2.5 : 2,
          strokeDasharray: dashed ? "5 4" : undefined,
        }}
      />
      {label ? (
        <EdgeLabelRenderer>
          <div
            className="nodrag nopan max-w-[140px] rounded border border-border-subtle bg-bg-panel/95 px-1.5 py-0.5 text-center text-[9px] leading-tight text-text-secondary"
            data-testid={`lineage-edge-label-${edgeType}`}
            style={{
              position: "absolute",
              transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
              pointerEvents: "none",
            }}
          >
            {String(label)}
          </div>
        </EdgeLabelRenderer>
      ) : null}
    </>
  );
}

export const lineageEdgeTypes = {
  lineageDecision: LineageDecisionEdge,
};
