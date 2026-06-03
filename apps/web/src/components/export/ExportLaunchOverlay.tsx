import type { IdeTarget } from "@architectai/shared";
import { VSCODE_EXTENSION_INSTALL_URI } from "@architectai/shared";
import { useState } from "react";
import { DriftLoopExplainer } from "@/components/export/DriftLoopExplainer";
import { HandoffFailureActions } from "@/components/export/HandoffFailureActions";
import { EXPORT_ARTIFACTS } from "@/lib/export-artifacts-copy";
import { Button } from "@/components/ui/Button";
import type { ExportLaunchStep } from "@/lib/export-handoff";
import { useIdeNativeHandoff } from "@/lib/export-handoff";
import { ideLabel } from "@/lib/ide";
import { cn } from "@/lib/utils";

const NATIVE_STEPS: { id: ExportLaunchStep; label: string }[] = [
  { id: "preparing", label: "Preparing governed export" },
  { id: "opening", label: "Opening Visual Studio Code" },
  { id: "waiting-for-ide", label: "Connect workspace in VS Code" },
];

const PREP_STEPS: { id: ExportLaunchStep; label: string }[] = [
  { id: "locking", label: "Preparing export baseline" },
  { id: "exporting", label: "Building .architectai artifacts" },
  { id: "handoff", label: "Registering legacy IDE workspace" },
];

const INSTALL_STEP = { id: "install" as const, label: "Install ArchitectAI extension" };
const OPEN_STEP = { id: "opening" as const, label: "Open legacy IDE with connect link" };
const WORKSPACE_STEP = {
  id: "workspace-setup" as const,
  label: "Choose workspace folder in legacy IDE",
};

interface Props {
  open: boolean;
  step: ExportLaunchStep;
  ide?: IdeTarget;
  deepLink?: string;
  copyHint?: string | null;
  error?: string | null;
  showInstallStep?: boolean;
  onCopyLink?: () => void;
  onConfirmInstall?: () => void;
  onConfirmWorkspace?: () => void;
  onClose?: () => void;
}

function stepIndex(
  step: ExportLaunchStep,
  order: ExportLaunchStep[],
): number {
  const idx = order.indexOf(step);
  if (idx >= 0) return idx;
  if (step === "preparing" && order.includes("locking")) return 0;
  return Math.max(order.length - 1, 0);
}

export function ExportLaunchOverlay({
  open,
  step,
  ide = "vscode",
  deepLink,
  copyHint,
  error,
  showInstallStep = false,
  onCopyLink,
  onConfirmInstall,
  onConfirmWorkspace,
  onClose,
}: Props): JSX.Element | null {
  if (!open) return null;
  const ideNative = useIdeNativeHandoff() && ide === "vscode";

  const steps = ideNative
    ? NATIVE_STEPS
    : showInstallStep
    ? [...PREP_STEPS, INSTALL_STEP, OPEN_STEP, WORKSPACE_STEP]
    : [...PREP_STEPS, OPEN_STEP, WORKSPACE_STEP];

  const activeIndex = stepIndex(
    step,
    steps.map((s) => s.id),
  );
  const showFailureLadder = Boolean(error) || step === "error";
  const atInstall = !ideNative && step === "install";
  const atWorkspace = !ideNative && step === "workspace-setup";
  const atWaiting = ideNative && (step === "opening" || step === "waiting-for-ide");
  const atDone = step === "done";
  const [eduOpen, setEduOpen] = useState(false);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      data-testid="export-launch-overlay"
      role="dialog"
      aria-modal="true"
    >
      <div className="w-full max-w-md rounded-xl border border-border-muted bg-bg-panel p-6 shadow-xl">
        <h2 className="text-lg font-semibold text-text-primary">
          Legacy export — {ideLabel(ide)}
        </h2>
        <p className="mt-2 text-sm text-text-muted">
          {ideNative
            ? atDone
              ? "Workspace connected — drift monitoring runs in your editor."
              : atWaiting
                ? "Visual Studio Code should open. Install ArchitectAI if prompted, then choose your project folder."
                : "Preparing your governed baseline..."
            : atInstall
            ? "Legacy path: install the ArchitectAI extension once, then open your IDE."
            : atWorkspace
              ? "In your IDE, pick the project folder where .architectai artifacts should live."
              : "Legacy governance bundle is ready. Follow the steps below to connect your IDE."}
        </p>

        <div className="mt-3">
          <button
            type="button"
            className="text-xs text-brand-violet hover:underline"
            data-testid="export-launch-education-toggle"
            onClick={() => setEduOpen((v) => !v)}
          >
            {eduOpen ? "Hide" : "What's included in this export?"}
          </button>
          {eduOpen ? (
            <div
              className="mt-2 max-h-40 overflow-y-auto rounded-lg border border-border-subtle p-2 text-xs"
              data-testid="export-education-panel"
            >
              <ul className="space-y-1 text-text-muted">
                {EXPORT_ARTIFACTS.map((a) => (
                  <li key={a.path}>
                    <span className="font-mono text-brand-violet">{a.path}</span> — {a.title}
                  </li>
                ))}
              </ul>
              <DriftLoopExplainer />
            </div>
          ) : null}
        </div>

        <ol className="mt-4 space-y-2" data-testid="export-launch-steps">
          {steps.map((s, i) => (
            <li
              key={s.id}
              className={cn(
                "flex items-center gap-2 text-sm",
                i <= activeIndex || atDone || step === "error"
                  ? "text-text-primary"
                  : "text-text-ghost",
              )}
              data-testid={`export-launch-step-${s.id}`}
            >
              <span
                className={cn(
                  "inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px]",
                  i < activeIndex || atDone
                    ? "bg-status-green text-bg-base"
                    : i === activeIndex && step !== "error"
                      ? "bg-brand-violet text-white"
                      : "bg-bg-elevated text-text-ghost",
                )}
              >
                {i < activeIndex || atDone ? "✓" : i + 1}
              </span>
              {s.label}
            </li>
          ))}
        </ol>

        {atInstall ? (
          <div className="mt-4 space-y-3" data-testid="export-install-panel">
            <a
              href={VSCODE_EXTENSION_INSTALL_URI}
              className="inline-flex w-full items-center justify-center rounded-lg bg-brand-violet px-4 py-2 text-sm font-medium text-white hover:bg-brand-violet/90"
              data-testid="export-install-marketplace"
            >
              Open extension in marketplace
            </a>
            <p className="text-xs text-text-muted">
              We cannot detect installation from the browser. After installing, confirm below.
            </p>
            {onConfirmInstall ? (
              <Button
                className="w-full"
                data-testid="export-install-confirm"
                onClick={() => onConfirmInstall()}
              >
                I installed the extension
              </Button>
            ) : null}
          </div>
        ) : null}

        {atWorkspace && !showFailureLadder ? (
          <div className="mt-4" data-testid="export-workspace-setup-panel">
            <p className="mb-3 text-xs text-text-muted">
              Visual Studio should show a folder picker or ArchitectAI setup panel. Select your
              repo root to write governed artifacts.
            </p>
            {onConfirmWorkspace ? (
              <Button
                className="w-full"
                data-testid="export-workspace-confirm"
                onClick={() => onConfirmWorkspace()}
              >
                I picked a workspace folder
              </Button>
            ) : null}
          </div>
        ) : null}

        {ideNative && atWaiting && !showFailureLadder ? (
          <p className="mt-4 text-xs text-text-muted" data-testid="export-waiting-ide">
            Waiting for VS Code to connect your workspace...
          </p>
        ) : null}

        {error ? (
          <p className="mt-4 text-sm text-status-red" data-testid="export-launch-error" role="alert">
            {error}
          </p>
        ) : null}

        {copyHint ? (
          <p className="mt-3 text-sm text-status-amber" data-testid="export-launch-hint">
            {copyHint}
          </p>
        ) : null}

        {deepLink ? (
          <p
            className="mt-3 break-all rounded-lg border border-brand-violet/30 bg-brand-violet/10 px-3 py-2 text-xs text-brand-violet"
            data-testid="export-launch-deep-link"
          >
            {deepLink}
          </p>
        ) : null}

        {atDone ? (
          <p
            className="mt-4 text-sm text-status-green"
            data-testid="export-launch-complete"
            role="status"
          >
            Legacy IDE handoff complete. Drift monitoring runs in your editor extension.
          </p>
        ) : null}

        {showFailureLadder ? (
          <HandoffFailureActions deepLink={deepLink} onCopyLink={onCopyLink} />
        ) : (
          <div className="mt-4 flex flex-wrap gap-2">
            {deepLink && onCopyLink && !atInstall ? (
              <Button
                variant="secondary"
                data-testid="export-launch-copy"
                onClick={() => onCopyLink()}
              >
                Copy link
              </Button>
            ) : null}
            {onClose ? (
              <Button variant="ghost" data-testid="export-launch-close" onClick={onClose}>
                Close
              </Button>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}
