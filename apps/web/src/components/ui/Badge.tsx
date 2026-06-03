import { cn } from "@/lib/utils";

type BadgeVariant = "violet" | "emerald" | "amber" | "neutral";

const styles: Record<BadgeVariant, string> = {
  violet: "border-brand-violet/20 bg-brand-violet/10 text-brand-violetLight",
  emerald: "border-status-green/20 bg-status-green/10 text-status-greenLight",
  amber: "border-status-amber/20 bg-status-amber/10 text-status-amberLight",
  neutral: "border-border-muted bg-bg-panel text-text-muted",
};

export function Badge({
  variant = "neutral",
  className,
  children,
}: {
  variant?: BadgeVariant;
  className?: string;
  children: React.ReactNode;
}): JSX.Element {
  return (
    <span
      className={cn(
        "inline-flex rounded-full border px-2 py-0.5 text-[10px] font-medium",
        styles[variant],
        className,
      )}
    >
      {children}
    </span>
  );
}
