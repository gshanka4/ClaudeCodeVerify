import type { IdeTarget } from "@architectai/shared";

/** Best-effort: user confirmed extension install (browser cannot detect VS Code extensions). */
export const EXTENSION_INSTALL_ACK_KEY = "architectai_extension_ack_v1";

export function isExtensionInstallAcknowledged(): boolean {
  try {
    return localStorage.getItem(EXTENSION_INSTALL_ACK_KEY) === "1";
  } catch {
    return false;
  }
}

export function acknowledgeExtensionInstall(): void {
  try {
    localStorage.setItem(EXTENSION_INSTALL_ACK_KEY, "1");
  } catch {
    /* private mode */
  }
}

export function clearExtensionInstallAcknowledgement(): void {
  try {
    localStorage.removeItem(EXTENSION_INSTALL_ACK_KEY);
  } catch {
    /* ignore */
  }
}

/** VS Code uses install funnel; Cursor/Antigravity use copy-link with install guidance. */
export function needsExtensionInstallStep(ide: IdeTarget): boolean {
  return ide === "vscode";
}
