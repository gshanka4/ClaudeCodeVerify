import { useCallback, useState } from "react";
import { DriftLoopExplainer } from "@/components/export/DriftLoopExplainer";
import { CLAUDE_CODE_SETUP_STEPS } from "@/lib/export-artifacts-copy";
import { buildApplyBundleScript, claudeCodeLaunchInstructions } from "@/lib/claude-code-apply";
import {
  CLAUDE_CODE_SETUP_TITLE,
  EXPORT_LEGACY_CTA,
  REEXPORT_CLAUDE_CODE,
} from "@/lib/product-copy";
import { exportHandoffErrorMessage, prepareExportHandoff } from "@/lib/export-handoff";
import { Button } from "@/components/ui/Button";
import { useWorkspaceStore } from "@/stores/useWorkspaceStore";

interface Props {
  open: boolean;
  architectureId: string | undefined;
  exportDisabled?: boolean;
  onClose: () => void;
  onOpenLegacyPicker: () => void;
}

export function ClaudeCodeSetupModal({
  open,
  architectureId,
  exportDisabled = false,
  onClose,
  onOpenLegacyPicker,
}: Props): JSX.Element | null {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [files, setFiles] = useState<Record<string, string> | null>(null);
  const [bundleName, setBundleName] = useState<string | null>(null);
  const [copyHint, setCopyHint] = useState<string | null>(null);
  const [stepDone, setStepDone] = useState<Record<string, boolean>>({});

  const reset = useCallback(() => {
    setFiles(null);
    setBundleName(null);
    setError(null);
    setCopyHint(null);
    setStepDone({});
  }, []);

  if (!open) return null;

  const runSetup = async () => {
    if (!architectureId || exportDisabled) return;
    setBusy(true);
    setError(null);
    try {
      const handoff = await prepareExportHandoff(architectureId, "claude-code");
      if (handoff.claudeCodeFiles) {
        const name = `architectai-${architectureId.slice(0, 8)}-claude-code.json`;
        const withApply = {
          ...handoff.claudeCodeFiles,
          "scripts/apply-architectai-bundle.mjs":
            handoff.claudeCodeFiles["scripts/apply-architectai-bundle.mjs"] ??
            buildApplyBundleScript(name),
        };
        setFiles(withApply);
        setBundleName(name);
        setStepDone({ files: false, claude: false, hooks: false });
        useWorkspaceStore.getState().setReExportMessage(REEXPORT_CLAUDE_CODE);
      } else {
        setError("Export succeeded but no Claude Code file map was returned.");
      }
    } catch (e) {
      setError(exportHandoffErrorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const downloadBundle = () => {
    if (!files || !bundleName) return;
    const blob = new Blob([JSON.stringify(files, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = bundleName;
    a.click();
    URL.revokeObjectURL(url);
    setStepDone((s) => ({ ...s, files: true }));
    setCopyHint(
      `Saved ${bundleName} — copy it into your repo root, then run the apply command below.`,
    );
  };

  const downloadApplyScript = () => {
    if (!bundleName) return;
    const script = buildApplyBundleScript(bundleName);
    const blob = new Blob([script], { type: "text/javascript" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "apply-architectai-bundle.mjs";
    a.click();
    URL.revokeObjectURL(url);
    setCopyHint(
      "Save apply-architectai-bundle.mjs in your repo scripts/ folder (or use the one inside the bundle).",
    );
  };

  const copyApplyCommand = async () => {
    if (!bundleName) return;
    const cmd = `node scripts/apply-architectai-bundle.mjs ${bundleName}`;
    try {
      await navigator.clipboard.writeText(cmd);
      setStepDone((s) => ({ ...s, files: true }));
      setCopyHint(`Copied: ${cmd}`);
    } catch {
      setCopyHint(cmd);
    }
  };

  const copyClaudeLaunch = async () => {
    const text = claudeCodeLaunchInstructions();
    try {
      await navigator.clipboard.writeText(text);
      setStepDone((s) => ({ ...s, claude: true }));
      setCopyHint("Copied Claude Code launch steps.");
    } catch {
      setCopyHint(text);
    }
  };

  const markHooksDone = () => {
    setStepDone((s) => ({ ...s, hooks: true }));
    setCopyHint("Hooks ship in .claude/settings.json — applied with the bundle.");
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
      role="dialog"
      aria-modal="true"
      data-testid="claude-code-setup-modal"
    >
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl border border-border-muted bg-bg-panel p-6 shadow-xl">
        <h2 id="claude-code-setup-title" className="text-lg font-semibold text-text-primary">
          {CLAUDE_CODE_SETUP_TITLE}
        </h2>
        <p className="mt-1 text-sm text-text-muted">
          Install your verified baseline into a repo, then open Claude Code to generate code against
          governance rules and drift hooks.
        </p>

        {error ? (
          <p className="mt-3 text-sm text-status-red" data-testid="claude-code-setup-error">
            {error}
          </p>
        ) : null}
        {copyHint ? (
          <p className="mt-2 text-sm text-status-amber" data-testid="claude-code-copy-hint">
            {copyHint}
          </p>
        ) : null}

        <ol className="mt-4 space-y-3" data-testid="claude-code-setup-steps">
          {CLAUDE_CODE_SETUP_STEPS.map((step) => (
            <li
              key={step.id}
              className="rounded-lg border border-border-muted bg-bg-surface px-3 py-2"
              data-testid={`claude-code-step-${step.id}`}
            >
              <div className="flex items-center gap-2 text-sm font-medium text-text-primary">
                <span>{stepDone[step.id] ? "✓" : "○"}</span>
                {step.label}
              </div>
              <p className="mt-0.5 text-xs text-text-muted">{step.detail}</p>
              {files && step.id === "files" ? (
                <div className="mt-2 flex flex-wrap gap-2">
                  <Button
                    className="px-3 py-1.5 text-xs"
                    data-testid="claude-code-download-bundle"
                    onClick={downloadBundle}
                  >
                    1. Download bundle
                  </Button>
                  <Button
                    className="px-3 py-1.5 text-xs"
                    variant="secondary"
                    onClick={copyApplyCommand}
                  >
                    2. Copy apply command
                  </Button>
                  <Button
                    className="px-3 py-1.5 text-xs"
                    variant="ghost"
                    onClick={downloadApplyScript}
                  >
                    Get apply script
                  </Button>
                </div>
              ) : null}
              {files && step.id === "claude" ? (
                <div className="mt-2">
                  <Button
                    className="px-3 py-1.5 text-xs"
                    data-testid="claude-code-copy-launch"
                    onClick={() => void copyClaudeLaunch()}
                  >
                    Copy Claude Code steps
                  </Button>
                </div>
              ) : null}
              {files && step.id === "hooks" ? (
                <div className="mt-2">
                  <Button
                    className="px-3 py-1.5 text-xs"
                    variant="secondary"
                    onClick={markHooksDone}
                  >
                    Mark hooks installed
                  </Button>
                </div>
              ) : null}
            </li>
          ))}
        </ol>

        {files ? (
          <section className="mt-4 rounded-lg border border-brand-violet/30 bg-brand-violet/5 px-3 py-3">
            <h3 className="text-xs font-medium text-text-secondary">
              Drift detection in Claude Code
            </h3>
            <DriftLoopExplainer />
          </section>
        ) : null}

        <div className="mt-4 flex flex-wrap gap-2">
          {!files ? (
            <Button
              data-testid="claude-code-generate-bundle"
              loading={busy}
              disabled={exportDisabled}
              onClick={() => void runSetup()}
            >
              Generate &amp; install bundle
            </Button>
          ) : null}
          <Button
            variant="ghost"
            data-testid="claude-code-legacy-ides"
            onClick={onOpenLegacyPicker}
          >
            {EXPORT_LEGACY_CTA}
          </Button>
          <Button
            variant="ghost"
            data-testid="claude-code-setup-close"
            onClick={() => {
              reset();
              onClose();
            }}
          >
            Close
          </Button>
        </div>

        {files ? (
          <ul
            className="mt-3 max-h-32 overflow-y-auto text-[11px] text-text-dim"
            data-testid="claude-code-file-list"
          >
            {Object.keys(files).map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        ) : null}
      </div>
    </div>
  );
}
