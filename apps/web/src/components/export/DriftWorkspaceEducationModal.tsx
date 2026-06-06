import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { DriftLoopExplainer } from "@/components/export/DriftLoopExplainer";
import { markDriftWorkspaceEducationSeen } from "@/lib/onboarding-flags";

interface Props {
  open: boolean;
  onContinue: () => void;
}

/** Educates users about drift detection after they land in the workspace. */
export function DriftWorkspaceEducationModal({ open, onContinue }: Props): JSX.Element | null {
  const [dontShow, setDontShow] = useState(false);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[55] flex items-center justify-center bg-black/70 p-4"
      data-testid="drift-workspace-education-modal"
      role="dialog"
      aria-modal="true"
      aria-labelledby="drift-workspace-education-title"
    >
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-border-muted bg-bg-panel p-6 shadow-xl">
        <h2
          id="drift-workspace-education-title"
          className="text-lg font-semibold text-text-primary"
        >
          Drift detection in Claude Code
        </h2>
        <p className="mt-2 text-sm text-text-muted">
          After you export to your repo, ArchitectAI keeps generated code aligned with your{" "}
          <strong className="text-text-secondary">verified baseline</strong>. Drift checks run
          automatically when Claude Code edits files — not only via prompts.
        </p>

        <section className="mt-4 rounded-lg border border-brand-violet/30 bg-brand-violet/5 px-4 py-3">
          <h3 className="text-sm font-medium text-text-secondary">How the drift loop works</h3>
          <DriftLoopExplainer />
        </section>

        <p className="mt-4 text-xs text-text-dim">
          Export installs <code className="text-brand-violet">.claude/settings.json</code> hooks and{" "}
          <code className="text-brand-violet">.architectai/credentials.json</code> so checks call
          your hosted API.
        </p>

        <label className="mt-4 flex items-center gap-2 text-xs text-text-dim">
          <input
            type="checkbox"
            checked={dontShow}
            onChange={(e) => setDontShow(e.target.checked)}
            data-testid="drift-workspace-education-dismiss"
          />
          Don&apos;t show again on workspace
        </label>

        <div className="mt-5 flex flex-wrap gap-2">
          <Button
            data-testid="drift-workspace-education-continue"
            onClick={() => {
              markDriftWorkspaceEducationSeen(dontShow);
              onContinue();
            }}
          >
            Got it — explore workspace
          </Button>
        </div>
      </div>
    </div>
  );
}
