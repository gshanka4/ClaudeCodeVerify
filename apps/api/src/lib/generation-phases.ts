import { GENERATION_PHASE_LABELS } from "@architectai/config";
import type { GenerationPhase, GenerationProgressEvent } from "@architectai/shared";

export function withGenerationPhase(
  base: Omit<GenerationProgressEvent, "phase" | "phaseLabel">,
  phase: GenerationPhase,
): GenerationProgressEvent {
  return {
    ...base,
    phase,
    phaseLabel: GENERATION_PHASE_LABELS[phase],
  };
}

/** Map service index to overlay phase (UX-A). */
export function phaseForServiceIndex(index: number, total: number): GenerationPhase {
  if (index === 0) return "requirements";
  if (index < total - 1) return "services";
  return "contracts";
}
