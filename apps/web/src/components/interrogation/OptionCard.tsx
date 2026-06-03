import type { QuestionOption } from "@architectai/shared";
import { Badge } from "@/components/ui/Badge";
import { KbdHint } from "@/components/ui/KbdHint";
import { cn } from "@/lib/utils";

interface OptionCardProps {
  option: QuestionOption;
  selected: boolean;
  disabled?: boolean;
  onSelect: () => void;
}

const badgeVariantMap = {
  violet: "violet",
  emerald: "emerald",
  amber: "amber",
} as const;

export function OptionCard({ option, selected, disabled, onSelect }: OptionCardProps): JSX.Element {
  return (
    <button
      type="button"
      data-testid={`option-${option.keyboardHint}`}
      disabled={disabled}
      onClick={onSelect}
      className={cn(
        "relative w-full rounded-xl border-2 p-5 text-left transition-all duration-200",
        disabled && "cursor-not-allowed opacity-60",
        selected
          ? "border-l-4 border-brand-violet border-brand-violet bg-[#1a1630]"
          : "border-border-muted bg-bg-panel hover:border-border-active hover:bg-bg-elevated",
      )}
    >
      <div className="absolute right-4 top-4">
        {selected ? (
          <Badge variant="violet">Selected</Badge>
        ) : (
          <KbdHint keys={[String(option.keyboardHint)]} />
        )}
      </div>
      <div className="flex flex-wrap items-center gap-2 pr-16">
        <span className="font-medium text-text-primary">{option.label}</span>
        {option.badge ? (
          <Badge variant={badgeVariantMap[option.badgeVariant ?? "violet"] ?? "neutral"}>
            {option.badge}
          </Badge>
        ) : null}
      </div>
      <p className="mt-2 text-sm text-text-muted">{option.description}</p>
    </button>
  );
}
