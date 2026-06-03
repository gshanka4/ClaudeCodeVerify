import { cn } from "@/lib/utils";

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger-ghost";

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  loading?: boolean;
  loadingLabel?: string;
}

const variants: Record<ButtonVariant, string> = {
  primary: "bg-brand-indigo text-white hover:bg-brand-indigoDark",
  secondary: "border border-border-muted text-text-secondary hover:border-border-active",
  ghost: "text-text-muted hover:bg-bg-elevated hover:text-text-primary",
  "danger-ghost":
    "text-text-dim hover:border hover:border-status-red/30 hover:bg-status-red/10 hover:text-text-primary",
};

export function Button({
  variant = "primary",
  loading,
  loadingLabel = "Loading…",
  className,
  children,
  disabled,
  ...props
}: ButtonProps): JSX.Element {
  return (
    <button
      type="button"
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50",
        variants[variant],
        className,
      )}
      disabled={disabled || loading}
      {...props}
    >
      {loading ? (
        <>
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
          {loadingLabel}
        </>
      ) : (
        children
      )}
    </button>
  );
}
