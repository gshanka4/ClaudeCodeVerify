import { useEffect, useRef } from "react";
import { LineageGraphView } from "@/components/workspace/LineageGraphView";
import { useWorkspaceStore } from "@/stores/useWorkspaceStore";

interface Props {
  architectureId: string;
}

/** CHG-1: provenance graph occupies the center main stage (replaces architecture canvas). */
export function LineageGraphStage({ architectureId }: Props): JSX.Element {
  const closeLineageGraph = useWorkspaceStore((s) => s.closeLineageGraph);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    closeButtonRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeLineageGraph();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [closeLineageGraph]);

  return (
    <div
      className="relative flex h-full min-h-0 flex-1 flex-col"
      data-testid="lineage-graph-stage"
      role="region"
      aria-label="Provenance graph"
    >
      <LineageGraphView
        architectureId={architectureId}
        onClose={closeLineageGraph}
        closeButtonRef={closeButtonRef}
      />
    </div>
  );
}
