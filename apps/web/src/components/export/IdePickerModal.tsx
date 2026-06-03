import { useCallback, useRef, useState } from "react";
import type { ExportIdeHandoffResponse } from "@architectai/shared";
import { Badge } from "@/components/ui/Badge";
import { ExportLaunchOverlay } from "@/components/export/ExportLaunchOverlay";
import {
  continueHandoffAfterInstall,
  exportHandoffErrorMessage,
  pollHandoffSessionUntilLinked,
  prepareExportHandoff,
  runIdeExportHandoff,
  shouldShowInstallStep,
  useIdeNativeHandoff,
  type ExportLaunchStep,
} from "@/lib/export-handoff";
import { EXPORT_LEGACY_CTA, REEXPORT_LEGACY_IDE } from "@/lib/product-copy";
import { IDE_OPTIONS, type IdeTarget } from "@/lib/ide";
import { useWorkspaceStore } from "@/stores/useWorkspaceStore";

interface IdePickerModalProps {
  open: boolean;
  architectureId: string | undefined;
  exportDisabled?: boolean;
  onClose: () => void;
}

export function IdePickerModal({
  open,
  architectureId,
  exportDisabled = false,
  onClose,
}: IdePickerModalProps): JSX.Element | null {
  const [launchOpen, setLaunchOpen] = useState(false);
  const [launchIde, setLaunchIde] = useState<IdeTarget>("vscode");
  const [launchStep, setLaunchStep] = useState<ExportLaunchStep>("preparing");
  const [handoff, setHandoff] = useState<ExportIdeHandoffResponse | null>(null);
  const [showInstallStep, setShowInstallStep] = useState(false);
  const [deepLink, setDeepLink] = useState<string | undefined>();
  const [copyHint, setCopyHint] = useState<string | null>(null);
  const [launchError, setLaunchError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const handoffRef = useRef<ExportIdeHandoffResponse | null>(null);
  const pollAbortRef = useRef(false);
  const ideNativeHandoff = useIdeNativeHandoff();

  const resetLaunch = useCallback(() => {
    setLaunchOpen(false);
    setLaunchError(null);
    setHandoff(null);
    handoffRef.current = null;
    setDeepLink(undefined);
    setCopyHint(null);
    setShowInstallStep(false);
    setLaunchStep("preparing");
    pollAbortRef.current = true;
  }, []);

  if (!open && !launchOpen) return null;

  const finishHandoffSuccess = () => {
    setLaunchStep("done");
    useWorkspaceStore
      .getState()
      .setReExportMessage(REEXPORT_LEGACY_IDE);
    setCopyHint(null);
  };

  const onPick = async (target: IdeTarget) => {
    if (!architectureId || exportDisabled) return;

    setBusy(true);
    setLaunchError(null);
    setCopyHint(null);
    setDeepLink(undefined);
    setLaunchStep("preparing");
    setLaunchIde(target);
    setLaunchOpen(true);
    onClose();

    try {
      const ideNative = ideNativeHandoff && target === "vscode";
      const needsInstall = shouldShowInstallStep(target);
      setShowInstallStep(needsInstall);

      if (needsInstall) {
        const prepared = await prepareExportHandoff(architectureId, target, setLaunchStep);
        handoffRef.current = prepared;
        setHandoff(prepared);
        setDeepLink(prepared.deepLink);
        setLaunchStep("install");
        return;
      }

      const result = await runIdeExportHandoff(architectureId, target, setLaunchStep);
      handoffRef.current = result.handoff;
      setHandoff(result.handoff);
      setDeepLink(result.handoff.deepLink);
      if (ideNative && result.handoff.handoffSessionId) {
        pollAbortRef.current = false;
        void (async () => {
          const linked = await pollHandoffSessionUntilLinked(
            architectureId,
            result.handoff.handoffSessionId!,
            { maxAttempts: 40 },
          );
          if (pollAbortRef.current) return;
          if (linked) {
            finishHandoffSuccess();
          } else {
            setCopyHint(
              "Still waiting in VS Code — pick a workspace folder or use Copy link if the IDE did not open.",
            );
          }
        })();
      }

      useWorkspaceStore
        .getState()
        .setReExportMessage(
          "Export handoff complete — reopen from Export anytime to sync again.",
        );
      if (result.launchMode === "copy-only" || target !== "vscode") {
        setCopyHint("Copy the legacy connect link and open your IDE to finish setup.");
      } else if (ideNative) {
        setCopyHint(null);
      } else {
        setCopyHint(
          "If Visual Studio did not open, install the ArchitectAI extension and use Copy link.",
        );
      }
    } catch (e) {
      setLaunchStep("error");
      setLaunchError(exportHandoffErrorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const onConfirmInstall = () => {
    const h = handoffRef.current;
    if (!h) return;
    try {
      const launchMode = continueHandoffAfterInstall(h, launchIde, setLaunchStep);
      setDeepLink(h.deepLink);
      if (architectureId && h.handoffSessionId && ideNativeHandoff && launchIde === "vscode") {
        pollAbortRef.current = false;
        void (async () => {
          const linked = await pollHandoffSessionUntilLinked(architectureId, h.handoffSessionId!, {
            maxAttempts: 40,
          });
          if (pollAbortRef.current) return;
          if (linked) finishHandoffSuccess();
        })();
      }
      if (launchMode === "copy-only") {
        setCopyHint("Copy the legacy connect link and open your IDE.");
      } else {
        setCopyHint(
          "If Visual Studio did not open, use Copy link below. Then pick your workspace folder in the IDE.",
        );
      }
    } catch (e) {
      setLaunchStep("error");
      setLaunchError(exportHandoffErrorMessage(e));
    }
  };

  const onConfirmWorkspace = () => finishHandoffSuccess();

  const onCopyLink = async () => {
    const link = deepLink ?? handoffRef.current?.deepLink;
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      setCopyHint("Legacy link copied — open your IDE and paste if it did not launch.");
    } catch {
      setCopyHint("Could not copy automatically — select the link and copy manually.");
    }
  };

  return (
    <>
      {open ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          data-testid="ide-picker-modal"
          role="dialog"
          aria-modal="true"
          aria-labelledby="ide-picker-title"
        >
          <div className="w-full max-w-md rounded-xl border border-border-muted bg-bg-panel p-6 shadow-xl">
            <h2 id="ide-picker-title" className="text-lg font-semibold text-text-primary">
              {EXPORT_LEGACY_CTA}
            </h2>
            <p className="mt-2 text-sm text-text-muted">
              {ideNativeHandoff
                ? "Legacy path: opens Visual Studio Code — install ArchitectAI if prompted, then pick your workspace folder."
                : "Legacy path: extension install, deep link, and IDE workspace picker (not required for Claude Code)."}
            </p>

            {exportDisabled ? (
              <p className="mt-3 text-sm text-status-amber" data-testid="ide-picker-disabled-hint">
                Architecture must be ready before export.
              </p>
            ) : null}

            <ul className="mt-4 space-y-2" data-testid="ide-picker-list">
              {IDE_OPTIONS.map((opt, index) => (
                <li key={opt.id}>
                  <button
                    type="button"
                    data-testid={`ide-picker-${opt.id}`}
                    data-ide-order={index}
                    disabled={exportDisabled || busy}
                    className="flex w-full items-center justify-between rounded-lg border border-border-muted bg-bg-surface px-4 py-3 text-left transition hover:border-brand-violet/50 hover:bg-bg-elevated disabled:cursor-not-allowed disabled:opacity-50"
                    onClick={() => void onPick(opt.id)}
                  >
                    <span>
                      <span className="font-medium text-text-primary">{opt.label}</span>
                      <span className="mt-0.5 block text-xs text-text-muted">{opt.description}</span>
                    </span>
                    {opt.recommended ? (
                      <span data-testid="ide-picker-vscode-badge">
                        <Badge variant="violet">Recommended</Badge>
                      </span>
                    ) : null}
                  </button>
                </li>
              ))}
            </ul>

            <button
              type="button"
              data-testid="ide-picker-cancel"
              className="mt-4 w-full rounded-lg border border-border-muted px-3 py-2 text-sm text-text-muted hover:bg-bg-elevated"
              onClick={onClose}
            >
              Cancel
            </button>
          </div>
        </div>
      ) : null}

      <ExportLaunchOverlay
        open={launchOpen}
        step={launchStep}
        ide={launchIde}
        deepLink={deepLink ?? handoff?.deepLink}
        copyHint={copyHint}
        error={launchError}
        showInstallStep={showInstallStep}
        onCopyLink={deepLink || handoff ? () => void onCopyLink() : undefined}
        onConfirmInstall={launchStep === "install" ? onConfirmInstall : undefined}
        onConfirmWorkspace={
          !ideNativeHandoff && launchStep === "workspace-setup" ? onConfirmWorkspace : undefined
        }
        onClose={resetLaunch}
      />
    </>
  );
}
