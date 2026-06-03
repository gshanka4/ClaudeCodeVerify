import { Handle, Position } from "@xyflow/react";
import type { LineageNodeType } from "@architectai/shared";

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

const TYPE_LABELS: Record<LineageNodeType, string> = {
  requirement: "Requirement",
  constraint: "Constraint",
  pattern: "Selected pattern",
  alternative: "Rejected",
  rule: "Governance rule",
  contract: "Contract",
  component: "Component",
  assumption: "Assumption",
  implication: "Implication",
};

export function LineageDecisionNode({
  data,
}: {
  data: {
    label: string;
    type: LineageNodeType;
    detail: string;
    nodeId: string;
    serviceId?: string;
    isFocus?: boolean;
    hasEvidence?: boolean;
    evidenceResolved?: boolean;
  };
}): JSX.Element {
  const color = NODE_COLORS[data.type] ?? "#4a5578";
  const isFocus = data.isFocus ?? data.type === "pattern";

  return (
    <div
      className={`max-w-[180px] rounded-md border-2 bg-bg-panel px-2 py-2 text-[10px] shadow-md ${
        isFocus ? "ring-2 ring-brand-violet/60" : ""
      }`}
      data-testid={
        data.serviceId
          ? `lineage-graph-node-${data.serviceId}`
          : `lineage-graph-node-${data.nodeId}`
      }
      data-lineage-node-type={data.type}
      style={{ borderColor: color }}
    >
      <Handle type="target" position={Position.Left} className="!h-2 !w-2 !bg-border-muted" />
      <Handle type="source" position={Position.Right} className="!h-2 !w-2 !bg-border-muted" />
      <span
        className="mb-1 inline-block rounded px-1 py-0.5 text-[9px] font-medium uppercase tracking-wide"
        style={{ backgroundColor: `${color}22`, color }}
      >
        {TYPE_LABELS[data.type]}
      </span>
      {isFocus ? (
        <p className="mb-0.5 text-[9px] font-semibold text-brand-violet">AI decision</p>
      ) : null}
      <p className="text-xs font-medium leading-tight text-text-primary">{data.label}</p>
      {data.detail ? (
        <p className="mt-1 line-clamp-2 text-[9px] leading-snug text-text-dim">{data.detail}</p>
      ) : null}
      {data.hasEvidence ? (
        <p
          className={`mt-1 text-[9px] ${data.evidenceResolved ? "text-text-muted" : "text-status-amber"}`}
        >
          {data.evidenceResolved ? "Verified evidence" : "Unverified evidence"}
        </p>
      ) : null}
    </div>
  );
}
