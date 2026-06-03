/** Pure connect/post-connect helpers (testable without vscode). */

export function isPendingWorkspacePath(path: string): boolean {
  return path.startsWith("pending:");
}

/** Panel mode after connect + optional bundle pull (I-EC-03, I-EC-04). */
export function postConnectPanelMode(
  bundleJson: string | null,
  folderPicked: boolean,
): "normal" | "setup" {
  if (!folderPicked) return "setup";
  if (bundleJson) return "normal";
  return "setup";
}
