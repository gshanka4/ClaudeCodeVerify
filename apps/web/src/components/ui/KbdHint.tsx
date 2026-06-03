import { cn } from "@/lib/utils";

interface KbdHintProps {
  keys: string[];
  label?: string;
  className?: string;
}

export function KbdHint({ keys, label, className }: KbdHintProps): JSX.Element {
  return (
    <span className={cn("inline-flex items-center gap-1", className)}>
      {keys.map((key) => (
        <kbd
          key={key}
          className="inline-flex h-5 min-w-[1.25rem] items-center justify-center rounded border border-border-muted bg-bg-panel px-1.5 font-mono text-[10px] text-text-dim"
        >
          {key}
        </kbd>
      ))}
      {label ? <span className="ml-1 text-[11px] text-text-ghost">{label}</span> : null}
    </span>
  );
}
