import { INTERROGATION } from "@architectai/config";

/** P2-EC-06 — generate CTA gating mirrors server `canGenerate` (min 3 answered). */
export function canShowGenerateButton(answeredCount: number): boolean {
  return answeredCount >= INTERROGATION.minQuestions;
}

export function generateDisabledReason(answeredCount: number): string {
  const remaining = INTERROGATION.minQuestions - answeredCount;
  return `Answer ${remaining} more question${remaining === 1 ? "" : "s"} to unlock generation`;
}
