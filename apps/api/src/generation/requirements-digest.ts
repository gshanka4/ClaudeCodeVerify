import type { QuestionRow } from "./types";

function answerLabel(q: QuestionRow): string {
  if (q.freeformAnswer?.trim()) return q.freeformAnswer.trim();
  return q.selectedOptionId ?? "(skipped)";
}

export function buildRequirementsDigest(
  initialPrompt: string,
  questions: QuestionRow[],
): string {
  const answered = questions
    .filter((q) => q.status === "answered" || q.status === "skipped")
    .sort((a, b) => a.questionIndex - b.questionIndex);

  const lines = [
    `INITIAL_REQUIREMENT: ${initialPrompt.slice(0, 4000)}`,
    "",
    "INTERROGATION_ANSWERS:",
    ...answered.map(
      (q) =>
        `Q${q.questionIndex + 1} [${q.category}]: ${answerLabel(q)}`,
    ),
  ];
  return lines.join("\n");
}

export function questionContextByIndex(
  questions: QuestionRow[],
): Map<number, { questionText: string; answerLabel: string; questionId: string }> {
  const map = new Map<number, { questionText: string; answerLabel: string; questionId: string }>();
  for (const q of questions) {
    if (q.status !== "answered") continue;
    map.set(q.questionIndex, {
      questionId: q.id,
      questionText: "", // filled by caller from full row if needed
      answerLabel: answerLabel(q),
    });
  }
  return map;
}
