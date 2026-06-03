import type { ArchitectureDetailResponse } from "@/lib/api";

const LANE_HEIGHT = 110;

interface SwimlanesProps {
  layers: ArchitectureDetailResponse["layers"];
}

export function Swimlanes({ layers }: SwimlanesProps): JSX.Element | null {
  if (layers.length === 0) return null;
  const sorted = [...layers].sort((a, b) => a.order - b.order);

  return (
    <div
      className="pointer-events-none absolute inset-0 z-0"
      data-testid="canvas-swimlanes"
      aria-hidden
    >
      {sorted.map((layer, index) => (
        <div
          key={layer.id}
          className="absolute left-0 right-0 border-t border-border-subtle/40 bg-bg-base/20"
          style={{ top: index * LANE_HEIGHT, height: LANE_HEIGHT }}
        >
          <span className="absolute left-2 top-1 text-[10px] uppercase tracking-wide text-text-ghost">
            {layer.displayName}
          </span>
        </div>
      ))}
    </div>
  );
}
