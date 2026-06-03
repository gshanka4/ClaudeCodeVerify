import type { LineageEdgeType, LineageNodeType } from "@architectai/shared";
import { LINEAGE_EDGE_STROKE } from "@/lib/lineage-graph-layout";

const NODE_COLORS: Record<LineageNodeType, string> = {
  requirement: "#6366f1",
  constraint: "#8b5cf6",
  pattern: "#22c55e",
  alternative: "#f59e0b",
  rule: "#ef4444",
  contract: "#06b6d4",
  component: "#a78bfa",
  assumption: "#94a3b8",
  implication: "#64748b",
};

const NODE_LEGEND: { type: LineageNodeType; label: string }[] = [
  { type: "requirement", label: "Requirement" },
  { type: "constraint", label: "Constraint" },
  { type: "rule", label: "Rule" },
  { type: "pattern", label: "AI choice" },
  { type: "contract", label: "Contract" },
  { type: "component", label: "Component" },
];

const EDGE_LEGEND: { type: LineageEdgeType; label: string }[] = [
  { type: "derives", label: "derives" },
  { type: "selects", label: "selects" },
  { type: "governs", label: "governs" },
  { type: "produces", label: "produces" },
  { type: "impacts", label: "impacts" },
];

export function LineageGraphLegend(): JSX.Element {
  return (
    <div
      className="absolute bottom-3 left-3 z-10 rounded-md border border-border-subtle bg-bg-panel/95 px-3 py-2 text-[10px]"
      data-testid="lineage-graph-legend"
    >
      <p className="mb-1.5 font-medium text-text-primary">Decision provenance</p>
      <div className="mb-2 flex flex-wrap gap-2">
        {NODE_LEGEND.map((item) => (
          <span key={item.type} className="flex items-center gap-1 text-text-dim">
            <span
              className="inline-block h-2 w-2 rounded-sm border"
              style={{ borderColor: NODE_COLORS[item.type] }}
            />
            {item.label}
          </span>
        ))}
      </div>
      <div className="flex flex-wrap gap-2">
        {EDGE_LEGEND.map((item) => (
          <span key={item.type} className="flex items-center gap-1 text-text-dim">
            <span
              className="inline-block h-0.5 w-4"
              style={{ backgroundColor: LINEAGE_EDGE_STROKE[item.type] }}
            />
            {item.label}
          </span>
        ))}
      </div>
    </div>
  );
}
