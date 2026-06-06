import type { ExportIdeHandoffResponse, IdeTarget } from "@architectai/shared";
export type { IdeTarget };
import { VSCODE_EXTENSION_INSTALL_URI } from "@architectai/shared";
import { ApiClientError, getHandoffSessionStatus, requestExportIdeHandoff } from "@/lib/api";
import {
  acknowledgeExtensionInstall,
  isExtensionInstallAcknowledged,
  needsExtensionInstallStep,
} from "@/lib/extension-install";
import { launchIdeHandoff } from "@/lib/ide";

export type ExportLaunchStep =
  | "preparing"
  | "locking"
  | "exporting"
  | "handoff"
  | "install"
  | "opening"
  | "waiting-for-ide"
  | "workspace-setup"
  | "done"
  | "error";

export interface VsCodeExportHandoffResult {
  handoff: ExportIdeHandoffResponse;
  launchMode: "launched" | "copy-only";
  installUri: string;
  skippedInstall: boolean;
}

export function useIdeNativeHandoff(): boolean {
  return import.meta.env.VITE_IDE_NATIVE_HANDOFF !== "0";
}

/** Prepare export + handoff payload (API). */
export async function prepareExportHandoff(
  architectureId: string,
  ide: IdeTarget,
  onStep?: (step: ExportLaunchStep) => void,
): Promise<ExportIdeHandoffResponse> {
  onStep?.("preparing");
  onStep?.("locking");
  onStep?.("exporting");
  const handoff = await requestExportIdeHandoff(architectureId, ide);
  onStep?.("handoff");
  return handoff;
}

export function shouldShowInstallStep(ide: IdeTarget): boolean {
  if (ide === "claude-code") return false;
  if (useIdeNativeHandoff() && ide === "vscode") return false;
  return needsExtensionInstallStep(ide) && !isExtensionInstallAcknowledged();
}

/** Launch IDE deep link after optional install acknowledgment. */
export function launchPreparedHandoff(
  handoff: ExportIdeHandoffResponse,
  ide: IdeTarget,
  onStep?: (step: ExportLaunchStep) => void,
): "launched" | "copy-only" {
  onStep?.("opening");
  const launchMode = launchIdeHandoff(handoff.deepLink, ide);
  onStep?.("waiting-for-ide");
  return launchMode;
}

export async function runIdeNativeExportHandoff(
  architectureId: string,
  ide: IdeTarget,
  onStep?: (step: ExportLaunchStep) => void,
): Promise<VsCodeExportHandoffResult> {
  const handoff = await prepareExportHandoff(architectureId, ide, onStep);
  const launchMode = launchPreparedHandoff(handoff, ide, onStep);
  return {
    handoff,
    launchMode,
    installUri: VSCODE_EXTENSION_INSTALL_URI,
    skippedInstall: true,
  };
}

/** Phase I / CHG-2: export with install funnel for first-time VS Code users. */
export async function runIdeExportHandoff(
  architectureId: string,
  ide: IdeTarget,
  onStep?: (step: ExportLaunchStep) => void,
): Promise<VsCodeExportHandoffResult> {
  if (useIdeNativeHandoff() && ide === "vscode") {
    return runIdeNativeExportHandoff(architectureId, ide, onStep);
  }

  const handoff = await prepareExportHandoff(architectureId, ide, onStep);
  const skippedInstall = !shouldShowInstallStep(ide);

  if (!skippedInstall) {
    onStep?.("install");
    return {
      handoff,
      launchMode: "copy-only",
      installUri: VSCODE_EXTENSION_INSTALL_URI,
      skippedInstall: false,
    };
  }

  const launchMode = launchPreparedHandoff(handoff, ide, onStep);
  onStep?.("done");
  return {
    handoff,
    launchMode,
    installUri: VSCODE_EXTENSION_INSTALL_URI,
    skippedInstall: true,
  };
}

/** After user confirms install, continue handoff from overlay. */
export function continueHandoffAfterInstall(
  handoff: ExportIdeHandoffResponse,
  ide: IdeTarget,
  onStep?: (step: ExportLaunchStep) => void,
): "launched" | "copy-only" {
  acknowledgeExtensionInstall();
  return launchPreparedHandoff(handoff, ide, onStep);
}

/** Poll handoff session until workspace linked or timeout (CHG-2 API). */
export async function pollHandoffSessionUntilLinked(
  architectureId: string,
  sessionId: string,
  opts: { intervalMs?: number; maxAttempts?: number } = {},
): Promise<boolean> {
  const intervalMs = opts.intervalMs ?? 1500;
  const maxAttempts = opts.maxAttempts ?? 40;
  for (let i = 0; i < maxAttempts; i++) {
    const status = await getHandoffSessionStatus(architectureId, sessionId);
    if (status.phase === "workspace_linked") return true;
    if (status.phase === "failed") return false;
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  return false;
}

export function exportHandoffErrorMessage(err: unknown): string {
  if (err instanceof ApiClientError) {
    if (err.status === 409) {
      const msg = err.message.toLowerCase();
      if (msg.includes("verification") || msg.includes("verify")) {
        return "Complete the Verification Pass on this architecture before exporting.";
      }
      if (msg.includes("lock")) {
        return "Lock the architecture before exporting to repo.";
      }
      return err.message;
    }
    if (err.status === 422) return err.message;
    return err.message;
  }
  return err instanceof Error ? err.message : "Export failed";
}
