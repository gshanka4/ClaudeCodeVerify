import { INTERROGATION } from "@architectai/config";
import type { InterrogationQuestion } from "@architectai/shared";
export { shouldAutoStartGeneration } from "@architectai/shared";

/** Resolved = answered or skipped (Phase H — all 7 before auto-generation). */
export function countResolvedQuestions(questions: InterrogationQuestion[]): number {
  return questions.filter((q) => q.status === "answered" || q.status === "skipped").length;
}

export function isInterrogationSessionComplete(
  sessionComplete: boolean,
  questions: InterrogationQuestion[],
): boolean {
  return sessionComplete || countResolvedQuestions(questions) >= INTERROGATION.maxQuestions;
}

export function isFreeformSubmitEnabled(text: string, loading: boolean, isEditing: boolean): boolean {
  return text.trim().length > 0 && !loading && !isEditing;
}
