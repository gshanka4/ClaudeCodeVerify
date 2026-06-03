import type { GenerationPhase } from "@architectai/shared";
import { GENERATION_PHASE_ORDER, labelForPhase, phaseIndex } from "@/lib/generation-phases";
import { cn } from "@/lib/utils";

interface Props {
  activePhase?: GenerationPhase;
}

export function GenerationPhaseSteps({ activePhase }: Props): JSX.Element {
  const activeIdx = phaseIndex(activePhase);

  return (
    <ol
      className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5"
      data-testid="generation-phase-steps"
    >
      {GENERATION_PHASE_ORDER.map((phase, i) => {
        const done = i < activeIdx;
        const active = phase === activePhase || (activePhase === undefined && i === 0);
        return (
          <li
            key={phase}
            data-testid={`generation-phase-${phase}`}
            className={cn(
              "rounded-lg border px-3 py-2 text-xs transition-colors",
              done && "border-status-green/40 bg-status-green/10 text-status-green",
              active && !done && "border-brand-violet/50 bg-brand-violet/10 text-text-primary",
              !done && !active && "border-border-subtle text-text-ghost",
            )}
          >
            <span className="font-medium">{labelForPhase(phase)}</span>
          </li>
        );
      })}
    </ol>
  );
}
