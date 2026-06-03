import { BrainCircuit } from "lucide-react";
import type { ArchitectureDetailResponse } from "@/lib/api";
import { CriticalDecisionsSection } from "@/components/workspace/CriticalDecisionsSection";
import { DecisionLineageLayer } from "@/components/workspace/DecisionLineageLayer";
import { useWorkspaceStore } from "@/stores/useWorkspaceStore";

interface Props {
  architectureId: string;
  detail: ArchitectureDetailResponse;
}

/** Right panel: decision lineage layer when a node is selected; critical decisions overview otherwise. */
export function ReasoningPanel({ architectureId, detail }: Props): JSX.Element {
  const selectedServiceId = useWorkspaceStore((s) => s.selectedServiceId);
  const selectedService = detail.services.find((s) => s.id === selectedServiceId);

  if (selectedServiceId && selectedService) {
    return (
      <DecisionLineageLayer
        architectureId={architectureId}
        serviceId={selectedServiceId}
        serviceDisplayName={selectedService.displayName}
      />
    );
  }

  return (
    <div className="flex h-full flex-col" data-testid="reasoning-panel">
      <header className="flex items-center gap-2 border-b border-border-muted px-4 py-3">
        <BrainCircuit size={16} className="text-brand-violet" />
        <h2 className="text-sm font-medium">Decision lineage</h2>
      </header>
      <div className="flex-1 overflow-y-auto px-4 py-3">
        <p className="mb-4 text-xs text-text-muted" data-testid="lineage-entry-hint">
          Select a component on the canvas to see why the AI architect placed it there — full
          reasoning, causal chain, and a chat to refine the decision.
        </p>
        <CriticalDecisionsSection
          architectureId={architectureId}
          selectedServiceId={null}
        />
      </div>
    </div>
  );
}
