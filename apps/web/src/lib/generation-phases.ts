import { GENERATION_PHASE_LABELS } from "@architectai/config";
import type { GenerationPhase } from "@architectai/shared";

export const GENERATION_PHASE_ORDER: GenerationPhase[] = [
  "requirements",
  "governance",
  "services",
  "contracts",
  "finalizing",
];

export function labelForPhase(phase: GenerationPhase | undefined): string {
  if (!phase) return GENERATION_PHASE_LABELS.requirements;
  return GENERATION_PHASE_LABELS[phase];
}

export function phaseIndex(phase: GenerationPhase | undefined): number {
  if (!phase) return 0;
  const idx = GENERATION_PHASE_ORDER.indexOf(phase);
  return idx >= 0 ? idx : 0;
}
