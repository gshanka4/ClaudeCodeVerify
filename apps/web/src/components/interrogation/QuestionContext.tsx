import { INTERROGATION_CATEGORY_COPY } from "@architectai/config";
import type { QuestionCategory } from "@architectai/shared";
import { cn } from "@/lib/utils";

interface Props {
  category: QuestionCategory;
  className?: string;
}

const CATEGORY_LABELS: Record<QuestionCategory, string> = {
  scale: "Scale",
  security: "Security",
  compliance: "Compliance",
  cloud: "Cloud",
  data: "Data",
  messaging: "Messaging",
  deployment: "Deployment",
  migration: "Migration",
};

export function QuestionContext({ category, className }: Props): JSX.Element {
  const helper = INTERROGATION_CATEGORY_COPY[category] ?? "This question refines your architecture.";

  return (
    <div className={cn("mb-4 space-y-2", className)} data-testid="question-context">
      <span className="inline-flex items-center rounded-full border border-brand-violet/30 bg-brand-violet/10 px-2.5 py-0.5 text-[11px] font-medium uppercase tracking-wide text-brand-violetLight">
        {CATEGORY_LABELS[category]}
      </span>
      <p className="text-sm text-text-muted">{helper}</p>
    </div>
  );
}
