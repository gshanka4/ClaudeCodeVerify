import {
  BaseEdge,
  EdgeLabelRenderer,
  getBezierPath,
  MarkerType,
  type EdgeProps,
} from "@xyflow/react";

export const STROKE_BY_KIND: Record<string, string> = {
  sync: "#10b981",
  async: "#8b5cf6",
  event: "#f59e0b",
  dependency: "#64748b",
};

const STROKE = STROKE_BY_KIND;

function CanvasEdge({
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
  const kind = (data?.kind as string) ?? "sync";
  const protocol = String(data?.protocol ?? label ?? "");
  const [path, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });
  const dashed = kind === "async" || kind === "dependency";
  const stroke = STROKE[kind] ?? STROKE.sync;

  return (
    <>
      <BaseEdge
        id={id}
        path={path}
        markerEnd={MarkerType.ArrowClosed}
        style={{
          stroke,
          strokeWidth: kind === "dependency" ? 1.5 : 2,
          strokeDasharray: dashed ? "6 4" : undefined,
        }}
      />
      {protocol ? (
        <EdgeLabelRenderer>
          <div
            className="nodrag nopan rounded bg-bg-panel/90 px-1 py-0.5 text-[10px] text-text-dim"
            style={{
              position: "absolute",
              transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
              pointerEvents: "all",
            }}
          >
            {protocol}
          </div>
        </EdgeLabelRenderer>
      ) : null}
    </>
  );
}

/** REQ-6: distinct edge renderers (shared implementation, typed keys). */
export const SyncEdge = CanvasEdge;
export const AsyncEdge = CanvasEdge;
export const EventEdge = CanvasEdge;

export const canvasEdgeTypes = {
  sync: SyncEdge,
  async: AsyncEdge,
  event: EventEdge,
  dependency: CanvasEdge,
};
