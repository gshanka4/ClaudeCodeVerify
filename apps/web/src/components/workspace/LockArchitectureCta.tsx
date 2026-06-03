import { useState } from "react";
import { LockGateModal } from "@/components/workspace/LockGateModal";
import {
  ApiClientError,
  lockArchitecture,
  VerificationGateApiError,
} from "@/lib/api";
import { formatLockCtaLabel } from "@/lib/lock-cta-label";
import { useWorkspaceStore } from "@/stores/useWorkspaceStore";
import { Button } from "@/components/ui/Button";
import type { VerificationGateConflict } from "@architectai/shared";

interface Props {
  architectureId: string;
  version: number;
  disabled?: boolean;
  onLocked?: (version: number) => void;
}

export function LockArchitectureCta({
  architectureId,
  version,
  disabled,
  onLocked,
}: Props): JSX.Element {
  const [locking, setLocking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [gateOpen, setGateOpen] = useState(false);
  const [conflicts, setConflicts] = useState<VerificationGateConflict[]>([]);
  const loadVerification = useWorkspaceStore((s) => s.loadVerification);

  const handleLock = async () => {
    setLocking(true);
    setError(null);
    try {
      const res = await lockArchitecture(architectureId);
      onLocked?.(res.version);
    } catch (e) {
      if (e instanceof VerificationGateApiError) {
        setConflicts(e.conflicts);
        setGateOpen(true);
      } else {
        setError(
          e instanceof ApiClientError ? e.message : "Could not finalize architecture for repo export",
        );
      }
    } finally {
      setLocking(false);
    }
  };

  return (
    <>
      <div className="flex flex-col items-end gap-1">
        <Button
          variant="secondary"
          data-testid="lock-architecture-cta"
          disabled={disabled || locking}
          loading={locking}
          onClick={() => void handleLock()}
        >
          {formatLockCtaLabel(version)}
        </Button>
        {error ? (
          <p
            className="max-w-xs text-right text-xs text-status-red"
            data-testid="lock-architecture-error"
            role="alert"
          >
            {error}
            <button
              type="button"
              className="ml-2 underline"
              data-testid="lock-architecture-retry"
              onClick={() => void handleLock()}
            >
              Retry
            </button>
          </p>
        ) : null}
      </div>
      <LockGateModal
        architectureId={architectureId}
        conflicts={conflicts}
        open={gateOpen}
        onClose={() => setGateOpen(false)}
        onLocked={(v) => {
          onLocked?.(v);
          setGateOpen(false);
        }}
        onOverridesApplied={() => void loadVerification(architectureId)}
      />
    </>
  );
}
