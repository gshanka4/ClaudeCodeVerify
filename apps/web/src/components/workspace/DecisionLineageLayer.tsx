import { DecisionTracePanel } from "@/components/workspace/DecisionTracePanel";
import { useWorkspaceStore } from "@/stores/useWorkspaceStore";

interface Props {
  architectureId: string;
  serviceId: string;
  serviceDisplayName: string;
}

/** Phase F alias — wraps UX-C Decision Trace panel for backward-compatible test ids. */
export function DecisionLineageLayer({
  architectureId,
  serviceId,
  serviceDisplayName,
}: Props): JSX.Element {
  const openLineageGraph = useWorkspaceStore((s) => s.openLineageGraph);

  return (
    <div className="flex h-full min-h-0 flex-col" data-testid="decision-lineage-layer">
      <DecisionTracePanel
        architectureId={architectureId}
        serviceId={serviceId}
        serviceDisplayName={serviceDisplayName}
        onOpenLineageGraph={() => openLineageGraph("trace-panel")}
      />
    </div>
  );
}
