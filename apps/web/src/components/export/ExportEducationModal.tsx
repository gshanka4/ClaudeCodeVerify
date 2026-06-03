import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { DriftLoopExplainer } from "@/components/export/DriftLoopExplainer";
import { EXPORT_ARTIFACTS } from "@/lib/export-artifacts-copy";
import { markExportEducationSeen } from "@/lib/onboarding-flags";

interface Props {
  open: boolean;
  onContinue: () => void;
  onClose: () => void;
}

export function ExportEducationModal({ open, onContinue, onClose }: Props): JSX.Element | null {
  const [dontShow, setDontShow] = useState(false);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-4"
      data-testid="export-education-modal"
      role="dialog"
      aria-labelledby="export-education-title"
    >
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-border-muted bg-bg-panel p-6 shadow-xl">
        <h2 id="export-education-title" className="text-lg font-semibold text-text-primary">
          What happens when you export to repo
        </h2>
        <p className="mt-2 text-sm text-text-muted">
          Export materializes a <strong className="text-text-secondary">verified baseline</strong>{" "}
          into your repository: <strong className="text-text-secondary">CLAUDE.md</strong>,{" "}
          <strong className="text-text-secondary">.architectai/*</strong>, MCP config, and optional
          PostToolUse hooks. Legacy Visual Studio / Cursor paths remain available if you need a GUI
          extension.
        </p>

        <section className="mt-5">
          <h3 className="text-sm font-medium text-text-secondary">Artifacts included</h3>
          <ul className="mt-2 space-y-2" data-testid="export-artifact-list">
            {EXPORT_ARTIFACTS.map((a) => (
              <li
                key={a.path}
                className="rounded-lg border border-border-subtle px-3 py-2 text-xs"
              >
                <p className="font-mono text-brand-violet">{a.path}</p>
                <p className="font-medium text-text-primary">{a.title}</p>
                <p className="text-text-muted">{a.description}</p>
              </li>
            ))}
          </ul>
        </section>

        <section className="mt-5">
          <h3 className="text-sm font-medium text-text-secondary">
            Drift detection (Claude Code hooks & legacy extension)
          </h3>
          <DriftLoopExplainer />
        </section>

        <label className="mt-4 flex items-center gap-2 text-xs text-text-dim">
          <input
            type="checkbox"
            checked={dontShow}
            onChange={(e) => setDontShow(e.target.checked)}
            data-testid="export-education-dismiss"
          />
          Don&apos;t show again
        </label>

        <div className="mt-5 flex flex-wrap gap-2">
          <Button
            data-testid="export-education-continue"
            onClick={() => {
              markExportEducationSeen(dontShow);
              onContinue();
            }}
          >
            Continue to export
          </Button>
          <Button variant="ghost" data-testid="export-education-close" onClick={onClose}>
            Cancel
          </Button>
        </div>
      </div>
    </div>
  );
}
