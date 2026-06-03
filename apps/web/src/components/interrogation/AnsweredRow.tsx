import type { InterrogationQuestion } from "@architectai/shared";
import { Pencil } from "lucide-react";
import { cn } from "@/lib/utils";

interface AnsweredRowProps {
  question: InterrogationQuestion;
  onEdit: (questionId: string) => void;
}

export function AnsweredRow({ question, onEdit }: AnsweredRowProps): JSX.Element {
  const answerLabel =
    question.selectedOptionId ??
    question.freeformAnswer ??
    (question.status === "skipped" ? "Skipped" : "—");
  const option = question.options.find((o) => o.id === question.selectedOptionId);

  return (
    <div
      data-testid={`answered-row-${question.id}`}
      className={cn(
        "group flex items-center gap-4 rounded-xl border border-border-muted bg-bg-panel px-5 py-3 transition-colors hover:border-border-active",
      )}
    >
      <span className="shrink-0 text-xs font-medium text-status-green">✓ Answered</span>
      <span className="min-w-0 flex-1 truncate text-sm text-text-muted">{question.questionText}</span>
      <span className="truncate text-sm text-text-secondary">{option?.label ?? answerLabel}</span>
      <button
        type="button"
        title="Edit this answer"
        data-testid={`edit-answer-${question.id}`}
        onClick={() => onEdit(question.id)}
        className="rounded-md p-1.5 text-text-ghost opacity-0 transition-all group-hover:opacity-100 hover:bg-brand-violet/10 hover:text-brand-violet"
      >
        <Pencil size={13} />
      </button>
    </div>
  );
}
