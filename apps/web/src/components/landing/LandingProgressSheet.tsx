import { cn } from "@/lib/utils";

export type LandingProgressStep = "auth" | "session" | "first-question" | "navigate";

const STEPS: { id: LandingProgressStep; label: string }[] = [
  { id: "auth", label: "Checking sign-in" },
  { id: "session", label: "Starting interrogation session" },
  { id: "first-question", label: "Loading first question" },
  { id: "navigate", label: "Opening interrogation" },
];

interface Props {
  activeStep: LandingProgressStep;
}

export function LandingProgressSheet({ activeStep }: Props): JSX.Element {
  const activeIdx = STEPS.findIndex((s) => s.id === activeStep);

  return (
    <div
      className="mt-4 rounded-xl border border-brand-indigo/30 bg-brand-indigo/5 px-4 py-3"
      data-testid="landing-progress-sheet"
      role="status"
      aria-live="polite"
    >
      <p className="mb-2 text-xs font-medium text-text-secondary">
        Starting your session — architecture and verification follow after a few questions
      </p>
      <ul className="space-y-1.5">
        {STEPS.map((step, i) => {
          const done = i < activeIdx;
          const active = step.id === activeStep;
          return (
            <li
              key={step.id}
              className={cn(
                "flex items-center gap-2 text-xs",
                done && "text-status-green",
                active && "text-brand-violet",
                !done && !active && "text-text-ghost",
              )}
              data-testid={`landing-progress-step-${step.id}`}
            >
              <span className="w-4 text-center">{done ? "✓" : active ? "●" : "○"}</span>
              {step.label}
            </li>
          );
        })}
      </ul>
      <div className="mt-3 h-1 overflow-hidden rounded-full bg-bg-elevated">
        <div
          className="h-full rounded-full bg-brand-violet transition-all duration-300"
          style={{ width: `${Math.max(12, ((activeIdx + 1) / STEPS.length) * 100)}%` }}
          data-testid="landing-progress-bar"
        />
      </div>
    </div>
  );
}
