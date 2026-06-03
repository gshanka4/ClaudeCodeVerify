import type { VerificationGateConflict } from "@architectai/shared";
import { useState } from "react";
import {
  ApiClientError,
  lockArchitecture,
  recordFindingOverride,
  VerificationGateApiError,
} from "@/lib/api";
import { Button } from "@/components/ui/Button";

interface Props {
  architectureId: string;
  conflicts: VerificationGateConflict[];
  open: boolean;
  onClose: () => void;
  onLocked: (version: number) => void;
  onOverridesApplied?: () => void;
}

export function LockGateModal({
  architectureId,
  conflicts,
  open,
  onClose,
  onLocked,
  onOverridesApplied,
}: Props): JSX.Element | null {
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState<string | null>(null);
  const [locking, setLocking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  if (!open) return null;

  const handleOverride = async (findingId: string) => {
    const reason = reasons[findingId]?.trim() ?? "";
    if (reason.length < 10) {
      setError("Override reason must be at least 10 characters");
      return;
    }
    setSubmitting(findingId);
    setError(null);
    try {
      await recordFindingOverride(architectureId, findingId, { reason });
      setSuccess("Override recorded — you can retry Lock");
      onOverridesApplied?.();
    } catch (e) {
      setError(e instanceof ApiClientError ? e.message : "Override failed — retry allowed");
    } finally {
      setSubmitting(null);
    }
  };

  const handleRetryLock = async () => {
    setLocking(true);
    setError(null);
    try {
      const res = await lockArchitecture(architectureId);
      onLocked(res.version);
      onClose();
    } catch (e) {
      if (e instanceof VerificationGateApiError) {
        setError("Unresolved conflicts remain — apply overrides first");
      } else {
        setError(e instanceof ApiClientError ? e.message : "Lock failed — you can retry");
      }
    } finally {
      setLocking(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-bg-base/80 px-4 backdrop-blur-sm"
      data-testid="lock-gate-modal"
      role="dialog"
      aria-modal="true"
    >
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl border border-border-muted bg-bg-panel p-6 shadow-xl">
        <h2 className="text-lg font-semibold text-text-primary">Lock blocked by verification</h2>
        <p className="mt-2 text-sm text-text-muted">
          Critical components have unresolved deterministic conflicts. Record an override with a
          typed reason, then retry Lock.
        </p>

        <ul className="mt-4 space-y-3" data-testid="lock-gate-conflicts">
          {conflicts.map((c) => (
            <li
              key={c.findingId}
              className="rounded-lg border border-status-red/40 bg-status-red/5 p-3"
              data-testid="lock-gate-conflict"
            >
              <p className="font-mono text-[10px] text-text-dim">{c.check}</p>
              <p className="mt-1 text-sm text-text-primary">{c.detail}</p>
              <label className="mt-2 block text-xs text-text-dim">Override reason (min 10 chars)</label>
              <textarea
                className="mt-1 w-full rounded border border-border-subtle bg-bg-elevated px-2 py-2 text-sm"
                rows={2}
                value={reasons[c.findingId] ?? ""}
                data-testid={`override-reason-${c.findingId}`}
                onChange={(e) =>
                  setReasons((prev) => ({ ...prev, [c.findingId]: e.target.value }))
                }
              />
              <Button
                className="mt-2"
                variant="secondary"
                loading={submitting === c.findingId}
                data-testid={`override-submit-${c.findingId}`}
                onClick={() => void handleOverride(c.findingId)}
              >
                Record override
              </Button>
            </li>
          ))}
        </ul>

        {error ? (
          <p className="mt-3 text-sm text-status-red" data-testid="lock-gate-error" role="alert">
            {error}
          </p>
        ) : null}
        {success ? (
          <p className="mt-3 text-sm text-status-green" data-testid="lock-gate-success">
            {success}
          </p>
        ) : null}

        <div className="mt-6 flex justify-end gap-2">
          <Button variant="ghost" data-testid="lock-gate-cancel" onClick={onClose}>
            Cancel
          </Button>
          <Button
            data-testid="lock-gate-retry"
            loading={locking}
            onClick={() => void handleRetryLock()}
          >
            Retry Lock
          </Button>
        </div>
      </div>
    </div>
  );
}
