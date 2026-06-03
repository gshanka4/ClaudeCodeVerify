import type { VerificationFinding } from "@architectai/shared";
import type { VerificationStreamState } from "@/hooks/useVerificationStream";
import { cn } from "@/lib/utils";

interface Props {
  verifyStream?: VerificationStreamState;
  findings: VerificationFinding[];
  active: boolean;
  complete: boolean;
}

const DETERMINISTIC_CHECKS = [
  "Schema & referential integrity",
  "Interrogation answer linkage",
  "Governance rule binding",
] as const;

export function VerificationProgressLanes({
  verifyStream,
  findings,
  active,
  complete,
}: Props): JSX.Element | null {
  if (!active) return null;

  const deterministic = findings.filter((f) => f.tier === "deterministic");
  const probabilistic = findings.filter((f) => f.tier === "probabilistic");
  const detDone =
    complete ||
    deterministic.length >= 1 ||
    (verifyStream?.progress?.tier === "probabilistic");
  const probStarted =
    probabilistic.length > 0 || verifyStream?.progress?.tier === "probabilistic";

  return (
    <div className="mt-4 space-y-3" data-testid="verification-progress-lanes">
      <div
        className="rounded-lg border border-border-muted bg-bg-panel/80 p-3"
        data-testid="verification-lane-deterministic"
      >
        <div className="flex items-center gap-2 text-xs font-medium text-text-primary">
          <span aria-hidden>⚡</span>
          Deterministic verification
          <span className="text-text-dim">(&lt;2s — proof-grade)</span>
          {detDone ? (
            <span className="ml-auto text-status-green">Complete</span>
          ) : (
            <span className="ml-auto text-brand-violet">Running…</span>
          )}
        </div>
        <ul className="mt-2 space-y-1">
          {DETERMINISTIC_CHECKS.map((label, i) => (
            <li
              key={label}
              className={cn(
                "flex items-center gap-2 text-[11px]",
                i < deterministic.length || detDone ? "text-status-green" : "text-text-ghost",
              )}
            >
              {i < deterministic.length || detDone ? "✓" : "○"} {label}
            </li>
          ))}
        </ul>
      </div>

      <div
        className={cn(
          "rounded-lg border p-3",
          probStarted ? "border-brand-violet/40 bg-brand-violet/5" : "border-border-subtle opacity-60",
        )}
        data-testid="verification-lane-probabilistic"
      >
        <div className="flex items-center gap-2 text-xs font-medium text-text-primary">
          <span aria-hidden>🔍</span>
          Probabilistic verification
          <span className="text-text-dim">(ground-truth signals)</span>
          {complete ? (
            <span className="ml-auto text-status-green">Complete</span>
          ) : probStarted ? (
            <span className="ml-auto text-brand-violet">Streaming…</span>
          ) : (
            <span className="ml-auto text-text-dim">Waiting</span>
          )}
        </div>
        <p className="mt-1 text-[11px] text-text-muted">
          Advisory findings — surfaced on the canvas as ⚠️; they do not block lock by themselves.
        </p>
        {probabilistic.length > 0 ? (
          <p className="mt-1 text-[11px] text-text-dim">{probabilistic.length} signal(s) received</p>
        ) : null}
      </div>
    </div>
  );
}
