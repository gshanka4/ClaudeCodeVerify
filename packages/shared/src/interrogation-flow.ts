import type { LinkedArchitectureStatus } from "./types";

/** Phase H: auto-start generation once when interrogation finishes. */
export function shouldAutoStartGeneration(input: {
  sessionComplete: boolean;
  linkedArchitectureStatus?: LinkedArchitectureStatus | null;
  generationArchitectureId: string | null;
  generationStarted: boolean;
}): boolean {
  if (!input.sessionComplete) return false;
  if (input.generationStarted) return false;
  if (input.generationArchitectureId) return false;
  const linked = input.linkedArchitectureStatus;
  if (linked === "ready" || linked === "generating") return false;
  return true;
}
