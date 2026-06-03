import type { TrustGradeBreakdown } from "@architectai/shared";
import { useState } from "react";
import { cn } from "@/lib/utils";

interface Props {
  trustGrade: TrustGradeBreakdown | null;
  loading?: boolean;
  className?: string;
}

export function TrustGradeBadge({ trustGrade, loading, className }: Props): JSX.Element | null {
  const [expanded, setExpanded] = useState(false);

  if (loading) {
    return (
      <div
        className={cn("h-8 w-24 animate-pulse rounded-md bg-bg-elevated", className)}
        data-testid="trust-grade-skeleton"
      />
    );
  }

  if (!trustGrade) return null;

  return (
    <div className={cn("relative", className)} data-testid="trust-grade-badge">
      <button
        type="button"
        className="rounded-md border border-border-muted bg-bg-elevated px-2.5 py-1 text-xs hover:border-brand-violet/40"
        aria-expanded={expanded}
        data-testid="trust-grade-trigger"
        onMouseEnter={() => setExpanded(true)}
        onMouseLeave={() => setExpanded(false)}
        onFocus={() => setExpanded(true)}
        onBlur={() => setExpanded(false)}
        onClick={() => setExpanded((v) => !v)}
      >
        <span className="text-text-dim">Trust Grade </span>
        <span className="font-semibold text-text-primary">{trustGrade.score}</span>
      </button>
      {expanded ? (
        <div
          className="absolute right-0 top-full z-20 mt-1 w-72 rounded-lg border border-border-muted bg-bg-panel p-3 text-xs shadow-lg"
          data-testid="trust-grade-breakdown"
        >
          <p className="mb-2 font-medium text-text-primary">Trust Grade breakdown</p>
          <p className="mb-2 text-text-muted">
            Verification score: {trustGrade.verificationScore}
            {trustGrade.driftPenalty != null ? ` · Drift: −${trustGrade.driftPenalty}` : ""}
          </p>
          {trustGrade.deductions.length === 0 ? (
            <p className="text-text-dim">No deductions — full verification confidence</p>
          ) : (
            <ul className="max-h-40 space-y-1 overflow-y-auto">
              {trustGrade.deductions.map((d, i) => (
                <li key={`${d.kind}-${i}`} className="flex justify-between gap-2 text-text-secondary">
                  <span className="truncate">{d.detail}</span>
                  <span className="shrink-0 text-status-red">−{d.amount}</span>
                </li>
              ))}
            </ul>
          )}
          {trustGrade.overrides.length > 0 ? (
            <div className="mt-2 border-t border-border-subtle pt-2">
              <p className="mb-1 font-medium text-text-dim">Overrides recorded</p>
              <ul className="space-y-1">
                {trustGrade.overrides.map((o) => (
                  <li key={o.findingId} className="text-text-muted">
                    {o.reason}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
