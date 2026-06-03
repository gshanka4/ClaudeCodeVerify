import { useEffect } from "react";
import { GenerationNodePreview } from "@/components/generation/GenerationNodePreview";
import { GenerationPhaseSteps } from "@/components/generation/GenerationPhaseSteps";
import { Button } from "@/components/ui/Button";
import type { GenerationStreamState } from "@/hooks/useGenerationStream";
import type { VerificationSummary } from "@architectai/shared";
import type { VerificationStreamState } from "@/hooks/useVerificationStream";
import { VerificationProgressLanes } from "@/components/generation/VerificationProgressLanes";
import { useOptimisticGenerationProgress } from "@/hooks/useOptimisticGenerationProgress";
import { labelForPhase } from "@/lib/generation-phases";
import { cn } from "@/lib/utils";

interface Props {
  stream: GenerationStreamState;
  verifyStream?: VerificationStreamState;
  completedSummary?: VerificationSummary | null;
  onCancel?: () => void;
  cancelling?: boolean;
  confirmCancel?: boolean;
  onRetry?: () => void;
  onEditAnswers?: () => void;
  onRetryVerify?: () => void;
  compact?: boolean;
}

export function GenerationExperience({
  stream,
  verifyStream,
  completedSummary,
  onCancel,
  cancelling,
  confirmCancel,
  onRetry,
  onEditAnswers,
  onRetryVerify,
  compact = false,
}: Props): JSX.Element {
  const optimistic = useOptimisticGenerationProgress(stream.progress, Boolean(stream.complete));
  const eta = stream.progress?.estimatedSecondsRemaining ?? null;
  const phaseLabel =
    stream.progress?.phaseLabel ??
    labelForPhase(stream.progress?.phase) ??
    (optimistic.isOptimistic ? optimistic.phaseLabel : null);
  const displayProgress = optimistic.displayProgress;
  const verifying = Boolean(stream.complete);
  const verifyDone = Boolean(verifyStream?.complete || completedSummary?.run.status === "complete");
  const verifyReconnecting = verifyStream?.reconnecting ?? false;
  const streamedFindings =
    verifyStream && verifyStream.findings.length > 0
      ? verifyStream.findings
      : (completedSummary?.findings ?? []);
  const trustGradeScore =
    verifyStream?.complete?.trustGrade ?? completedSummary?.trustGrade.score;

  return (
    <div
      className={cn(compact ? "space-y-6" : "mx-auto max-w-4xl space-y-8")}
      data-testid="generation-experience"
    >
      <header className={cn(!compact && "text-center")} id="generation-overlay-title">
        <h2 className={cn(compact ? "text-xl font-semibold" : "text-2xl font-semibold")}>
          Building your architecture
        </h2>
        <p className="mt-2 text-sm text-text-muted">
          Streaming governed services and decision lineage
          {stream.reconnecting ? (
            <span className="ml-2 text-status-amber" data-testid="generation-reconnecting">
              ● Reconnecting…
            </span>
          ) : stream.connected ? (
            <span className="ml-2 text-status-green">● Live</span>
          ) : stream.complete ? (
            verifyDone ? (
              <span className="ml-2 text-status-green">● Verified</span>
            ) : (
              <span className="ml-2 text-brand-violet">● Verifying…</span>
            )
          ) : null}
          {verifyReconnecting ? (
            <span className="ml-2 text-status-amber" data-testid="verification-reconnecting">
              ● Reconnecting verification…
            </span>
          ) : null}
        </p>
        {phaseLabel ? (
          <p className="mt-1 text-xs text-text-dim" data-testid="generation-active-phase">
            {phaseLabel}
          </p>
        ) : null}
        {eta !== null && !stream.complete ? (
          <p className="mt-1 text-xs text-text-dim" data-testid="generation-eta">
            ~{eta}s remaining
          </p>
        ) : null}
      </header>

      <GenerationPhaseSteps activePhase={stream.progress?.phase} />

      <div className="rounded-xl border border-border-muted bg-bg-panel p-4">
        <div className="mb-2 flex justify-between text-xs text-text-dim">
          <span>Overall progress</span>
          <span>{displayProgress}%</span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-bg-elevated">
          <div
            className="h-full rounded-full bg-gradient-to-r from-brand-indigo to-brand-violet transition-all duration-500"
            style={{ width: `${displayProgress}%` }}
            data-testid="generation-progress-bar"
          />
        </div>
        {optimistic.isOptimistic ? (
          <p className="mt-2 text-[11px] text-text-dim" data-testid="generation-loading-art">
            {optimistic.phaseLabel} — typically 20–40s with live models
          </p>
        ) : null}
        {stream.progress ? (
          <div className="mt-4 grid grid-cols-3 gap-4 text-center text-xs">
            <Metric label="Confidence" value={stream.progress.confidenceScore} />
            <Metric label="Governance" value={stream.progress.governanceScore} />
            <Metric label="AI Trust" value={stream.progress.aiTrustScore} />
          </div>
        ) : (
          <div className="mt-4 grid grid-cols-3 gap-2">
            {[1, 2, 3].map((i) => (
              <div
                key={i}
                className="h-12 animate-pulse rounded-md bg-bg-elevated"
                data-testid="generation-skeleton-metric"
              />
            ))}
          </div>
        )}
      </div>

      <GenerationNodePreview nodes={stream.nodes} />

      <section>
        <h3 className="mb-3 text-sm font-medium text-text-secondary">Governance checklist</h3>
        <ul className="space-y-2" data-testid="governance-checklist">
          {stream.governance.length === 0 ? (
            <li className="text-xs text-text-ghost">Preparing checks…</li>
          ) : (
            stream.governance.map((g, i) => (
              <li
                key={i}
                className="flex items-center gap-2 rounded-md border border-border-subtle px-3 py-2 text-sm animate-fade-in"
              >
                <span className={g.done ? "text-status-green" : "text-text-ghost"}>
                  {g.done ? "✓" : "○"}
                </span>
                {g.checkText}
              </li>
            ))
          )}
        </ul>
      </section>

      <section>
        <h3 className="mb-3 text-sm font-medium text-text-secondary">Services appearing</h3>
        <div className="grid gap-3 sm:grid-cols-2" data-testid="node-stream">
          {stream.nodes.length === 0 ? (
            <p className="text-xs text-text-ghost sm:col-span-2">Mapping components…</p>
          ) : (
            stream.nodes.map((n) => (
              <div
                key={n.serviceId}
                data-testid="generation-node-card"
                className="rounded-lg border border-border-muted bg-bg-panel p-4 animate-fade-in"
              >
                <p className="font-medium text-text-primary">{n.name}</p>
                <p className="text-xs text-text-muted capitalize">{n.layer}</p>
                <p className="mt-1 text-xs text-text-dim">Confidence {n.confidenceScore}%</p>
              </div>
            ))
          )}
        </div>
      </section>

      {verifying ? (
        <section
          className="rounded-xl border border-brand-violet/30 bg-brand-violet/5 p-4"
          data-testid="verification-pass"
        >
          <h3 className="text-sm font-medium text-text-primary">Verification Pass</h3>
          <p className="mt-1 text-xs text-text-muted">
            Independent checks against ground truth — deterministic proof first, then probabilistic signals
          </p>
          <VerificationProgressLanes
            verifyStream={verifyStream}
            findings={streamedFindings}
            active
            complete={verifyDone}
          />
          {verifyStream?.progress ? (
            <p className="mt-2 text-xs text-text-dim">
              Checks {verifyStream.progress.checksComplete}/{verifyStream.progress.checksTotal} ·{" "}
              {verifyStream.progress.tier}
            </p>
          ) : null}
          <ul className="mt-3 max-h-48 space-y-2 overflow-y-auto" data-testid="verification-stream-findings">
            {streamedFindings.length === 0 ? (
              <li className="text-xs text-text-ghost">Awaiting findings…</li>
            ) : (
              streamedFindings.map((f) => (
                <li
                  key={f.id}
                  className="rounded border border-border-subtle px-2 py-1.5 text-xs animate-fade-in"
                  data-testid="verification-stream-finding"
                  data-finding-tier={f.tier}
                >
                  <span className="font-mono text-[10px] text-text-dim">{f.check}</span>
                  <p className="text-text-secondary">{f.detail}</p>
                  {f.tier === "deterministic" ? (
                    <span
                      className={
                        f.verdict === "conflict" ? "text-status-red" : "text-status-green"
                      }
                    >
                      {f.verdict === "conflict" ? "❌" : "✅"} {f.verdict}
                    </span>
                  ) : (
                    <span className="text-brand-violet">
                      ~{Math.round(f.confidence * 100)}% · signal, not proof
                    </span>
                  )}
                </li>
              ))
            )}
          </ul>
          {verifyDone ? (
            <p
              className="mt-3 text-sm text-status-green"
              data-testid="verification-complete"
            >
              Verification complete — Trust Grade {trustGradeScore ?? "—"}
            </p>
          ) : null}
          {verifyStream?.error && !verifyDone ? (
            <div className="mt-3 rounded-lg border border-status-amber/40 bg-status-amber/10 p-3" role="alert">
              <p className="text-sm text-status-amber" data-testid="verification-error">
                {verifyStream.error}
              </p>
              {onRetryVerify ? (
                <Button
                  variant="secondary"
                  className="mt-2"
                  data-testid="verification-retry-cta"
                  onClick={onRetryVerify}
                >
                  Retry verification
                </Button>
              ) : null}
            </div>
          ) : null}
        </section>
      ) : null}

      {stream.error ? (
        <div
          className="rounded-lg border border-status-red/40 bg-status-red/10 p-4"
          data-testid="generation-error"
          role="alert"
        >
          <p className="text-sm text-status-red">{stream.error}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {onRetry ? (
              <Button variant="secondary" data-testid="generation-retry" onClick={onRetry}>
                Retry generation
              </Button>
            ) : null}
            {onEditAnswers ? (
              <Button variant="ghost" data-testid="generation-edit-answers" onClick={onEditAnswers}>
                Edit answers
              </Button>
            ) : null}
          </div>
        </div>
      ) : null}

      {onCancel && !stream.error ? (
        <footer className="flex justify-center border-t border-border-subtle pt-4">
          <Button
            variant="danger-ghost"
            data-testid="cancel-generation"
            onClick={onCancel}
            loading={cancelling}
          >
            {confirmCancel ? "Confirm cancel" : "Cancel generation"}
          </Button>
        </footer>
      ) : null}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number }): JSX.Element {
  return (
    <div>
      <p className="text-text-ghost">{label}</p>
      <p className="font-medium text-text-primary">{value}%</p>
    </div>
  );
}

/** Auto-navigate when generation completes (Phase H). */
export function useGenerationAutoNavigate(
  stream: GenerationStreamState,
  onComplete: (architectureId: string) => void,
): void {
  useEffect(() => {
    if (stream.complete?.architectureId) {
      onComplete(stream.complete.architectureId);
    }
  }, [stream.complete, onComplete]);
}
