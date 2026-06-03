import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useJourneyProgress, type JourneyStepId } from "@/hooks/useJourneyProgress";
import { isJourneyMapCollapsed, setJourneyMapCollapsed } from "@/lib/onboarding-flags";
import { cn } from "@/lib/utils";

function stepHref(id: JourneyStepId, architectureId?: string): string | null {
  switch (id) {
    case "describe":
      return "/";
    case "export":
      return architectureId ? `/export/${architectureId}` : null;
    case "explore":
    case "lineage":
    case "lock":
      return architectureId ? `/workspace/${architectureId}` : null;
    default:
      return null;
  }
}

export function ProductJourneyMap(): JSX.Element | null {
  const { steps, hideOnLanding } = useJourneyProgress();
  const { architectureId } = useParams<{ architectureId: string }>();
  const [collapsed, setCollapsed] = useState(isJourneyMapCollapsed);

  if (hideOnLanding) return null;

  const toggle = () => {
    const next = !collapsed;
    setCollapsed(next);
    setJourneyMapCollapsed(next);
  };

  return (
    <aside
      className={cn(
        "fixed bottom-20 right-4 z-40 w-56 rounded-xl border border-border-muted bg-bg-panel/95 shadow-lg backdrop-blur-sm",
        collapsed && "w-auto",
      )}
      data-testid="product-journey-map"
    >
      <button
        type="button"
        className="flex w-full items-center justify-between px-3 py-2 text-left text-xs font-medium text-text-secondary"
        onClick={toggle}
        data-testid="journey-map-toggle"
      >
        Trust loop
        <span className="text-text-ghost">{collapsed ? "▸" : "▾"}</span>
      </button>
      {!collapsed ? (
        <ol className="max-h-[50vh] space-y-1 overflow-y-auto px-2 pb-3">
          {steps.map((step) => {
            const href = stepHref(step.id, architectureId);
            const content = (
              <>
                <span className="w-4 shrink-0 text-center text-[10px]">
                  {step.state === "complete" ? "✓" : step.state === "active" ? "●" : "○"}
                </span>
                <span className="truncate">{step.label}</span>
              </>
            );
            return (
              <li
                key={step.id}
                data-testid={`journey-step-${step.id}`}
                className={cn(
                  "flex items-center gap-1 rounded-md px-1 py-0.5 text-[11px]",
                  step.state === "active" && "bg-brand-violet/15 text-brand-violet",
                  step.state === "complete" && "text-status-green",
                  step.state === "upcoming" && "text-text-ghost",
                )}
              >
                {href && step.state !== "upcoming" ? (
                  <Link to={href} className="flex min-w-0 flex-1 items-center gap-1 hover:underline">
                    {content}
                  </Link>
                ) : (
                  <span className="flex min-w-0 flex-1 items-center gap-1">{content}</span>
                )}
              </li>
            );
          })}
        </ol>
      ) : null}
    </aside>
  );
}
