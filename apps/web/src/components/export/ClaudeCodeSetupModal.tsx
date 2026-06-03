import { useCallback, useState } from "react";
import { CLAUDE_CODE_SETUP_STEPS } from "@/lib/export-artifacts-copy";
import { CLAUDE_CODE_SETUP_TITLE, EXPORT_LEGACY_CTA, REEXPORT_CLAUDE_CODE } from "@/lib/product-copy";
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
  const [setupCommand, setSetupCommand] = useState<string | null>(null);
  const [copyHint, setCopyHint] = useState<string | null>(null);
  const [stepDone, setStepDone] = useState<Record<string, boolean>>({});

  const reset = useCallback(() => {
    setFiles(null);
    setSetupCommand(null);
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
        setFiles(handoff.claudeCodeFiles);
        setSetupCommand(handoff.setupCommand ?? null);
        setStepDone({ files: true });
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
    if (!files || !architectureId) return;
    const blob = new Blob([JSON.stringify(files, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `architectai-${architectureId.slice(0, 8)}-claude-code.json`;
    a.click();
    URL.revokeObjectURL(url);
    setCopyHint("Bundle downloaded — extract paths into your repo.");
  };

  const copyMcpJson = async () => {
    if (!files?.[".mcp.json"]) return;
    try {
      await navigator.clipboard.writeText(files[".mcp.json"]);
      setStepDone((s) => ({ ...s, mcp: true }));
      setCopyHint(".mcp.json copied — run claude mcp add or merge into project .mcp.json");
    } catch {
      setCopyHint("Could not copy — select .mcp.json from the bundle manually.");
    }
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
          Materialize your verified baseline into the repo so every Claude Code session inherits
          governance — no IDE deep link required.
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
            </li>
          ))}
        </ol>

        <div className="mt-4 flex flex-wrap gap-2">
          {!files ? (
            <Button
              data-testid="claude-code-generate-bundle"
              loading={busy}
              disabled={exportDisabled}
              onClick={() => void runSetup()}
            >
              Generate Claude Code bundle
            </Button>
          ) : (
            <>
              <Button data-testid="claude-code-download-bundle" onClick={downloadBundle}>
                Download bundle
              </Button>
              <Button variant="secondary" data-testid="claude-code-copy-mcp" onClick={() => void copyMcpJson()}>
                Copy .mcp.json
              </Button>
            </>
          )}
          <Button variant="ghost" data-testid="claude-code-legacy-ides" onClick={onOpenLegacyPicker}>
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

        {setupCommand ? (
          <p className="mt-3 font-mono text-[11px] text-text-dim" data-testid="claude-code-setup-command">
            {setupCommand}
          </p>
        ) : null}

        {files ? (
          <ul className="mt-3 max-h-32 overflow-y-auto text-[11px] text-text-dim" data-testid="claude-code-file-list">
            {Object.keys(files).map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
        ) : null}
      </div>
    </div>
  );
}
