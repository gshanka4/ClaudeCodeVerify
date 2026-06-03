import { useEffect, useState } from "react";
import { Button } from "@/components/ui/Button";

const KEY = "architectai_workspace_coach_seen";

interface Props {
  architectureId: string;
  onOpenLineage?: () => void;
}

export function WorkspaceCoachMarks({ architectureId, onOpenLineage }: Props): JSX.Element | null {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    try {
      if (localStorage.getItem(KEY) === "1") return;
      setOpen(true);
    } catch {
      /* ignore */
    }
  }, [architectureId]);

  if (!open) return null;

  return (
    <div
      className="absolute bottom-4 left-4 z-20 max-w-sm rounded-xl border border-brand-violet/40 bg-bg-panel p-4 shadow-lg"
      data-testid="workspace-coach-marks"
      role="status"
    >
      <p className="text-sm font-medium text-text-primary">Trust loop on the canvas</p>
      <ul className="mt-2 space-y-1 text-xs text-text-muted">
        <li>✅ Verified — deterministic proof against ground truth</li>
        <li>⚠️ Unverified — probabilistic signal; review before lock</li>
        <li>❌ Conflict — blocks lock until resolved or overridden</li>
      </ul>
      <p className="mt-2 text-xs text-text-dim">
        Open <strong>Decision lineage</strong> for the full provenance graph (why each component exists).
      </p>
      <div className="mt-3 flex gap-2">
        {onOpenLineage ? (
          <Button variant="secondary" data-testid="coach-open-lineage" onClick={onOpenLineage}>
            Open lineage
          </Button>
        ) : null}
        <Button
          data-testid="coach-dismiss"
          onClick={() => {
            try {
              localStorage.setItem(KEY, "1");
            } catch {
              /* ignore */
            }
            setOpen(false);
          }}
        >
          Got it
        </Button>
      </div>
    </div>
  );
}
