import * as vscode from "vscode";
import { ARCHITECTAI_EXTENSION_ID, VSCODE_EXTENSION_INSTALL_URI } from "@architectai/shared";

let pendingConnectUri: string | null = null;

export function setPendingConnectUri(uri: string | null): void {
  pendingConnectUri = uri;
}

export function getPendingConnectUri(): string | null {
  return pendingConnectUri;
}

export function isArchitectAiExtensionInstalled(): boolean {
  return Boolean(vscode.extensions.getExtension(ARCHITECTAI_EXTENSION_ID));
}

export function isArchitectAiExtensionActive(): boolean {
  return Boolean(vscode.extensions.getExtension(ARCHITECTAI_EXTENSION_ID)?.isActive);
}

/** Prompt to install from marketplace when deep link opens without extension (CHG-2). */
export async function promptInstallExtension(): Promise<void> {
  const choice = await vscode.window.showInformationMessage(
    "Install ArchitectAI to connect your governed workspace and monitor drift.",
    "Install extension",
    "Later",
    "Copy install link",
  );
  if (choice === "Install extension") {
    await vscode.env.openExternal(vscode.Uri.parse(VSCODE_EXTENSION_INSTALL_URI));
  } else if (choice === "Copy install link") {
    await vscode.env.clipboard.writeText(VSCODE_EXTENSION_INSTALL_URI);
    void vscode.window.showInformationMessage("Install link copied to clipboard.");
  }
}

export type WorkspacePickResult =
  | { kind: "current" | "opened" | "created"; folder: vscode.Uri; fsPath: string }
  | { kind: "cancelled" };

async function openFolder(folder: vscode.Uri): Promise<void> {
  const existing = vscode.workspace.workspaceFolders?.[0]?.uri;
  if (existing?.fsPath === folder.fsPath) return;
  await vscode.commands.executeCommand("vscode.openFolder", folder, { forceNewWindow: false });
}

export async function pickOrCreateWorkspace(): Promise<WorkspacePickResult> {
  const existing = vscode.workspace.workspaceFolders?.[0]?.uri;
  const options: vscode.QuickPickItem[] = [];
  if (existing) {
    options.push({
      label: "Use current workspace folder",
      description: existing.fsPath,
      detail: "Write .architectai to the currently open project",
    });
  }
  options.push(
    {
      label: "Open existing folder...",
      description: "Select an existing repo/project folder",
    },
    {
      label: "Create new workspace folder...",
      description: "Create and open a new project directory",
    },
  );
  const pickedMode = await vscode.window.showQuickPick(options, {
    placeHolder: "Where should ArchitectAI write governed artifacts?",
    ignoreFocusOut: true,
  });
  if (!pickedMode) return { kind: "cancelled" };

  if (pickedMode.label.startsWith("Use current") && existing) {
    return { kind: "current", folder: existing, fsPath: existing.fsPath };
  }

  if (pickedMode.label.startsWith("Open existing")) {
    const picked = await vscode.window.showOpenDialog({
      canSelectFiles: false,
      canSelectFolders: true,
      canSelectMany: false,
      openLabel: "Open workspace folder",
      title: "Choose workspace for ArchitectAI artifacts",
    });
    const folder = picked?.[0];
    if (!folder) return { kind: "cancelled" };
    await openFolder(folder);
    return { kind: "opened", folder, fsPath: folder.fsPath };
  }

  const parentPick = await vscode.window.showOpenDialog({
    canSelectFiles: false,
    canSelectFolders: true,
    canSelectMany: false,
    openLabel: "Select parent folder",
    title: "Choose parent directory for new workspace",
  });
  const parent = parentPick?.[0];
  if (!parent) return { kind: "cancelled" };
  const folderName = await vscode.window.showInputBox({
    prompt: "Name for new workspace folder",
    placeHolder: "my-governed-project",
    validateInput: (value) => (value.trim().length > 0 ? null : "Folder name is required"),
  });
  if (!folderName?.trim()) return { kind: "cancelled" };
  const folder = vscode.Uri.joinPath(parent, folderName.trim());
  await vscode.workspace.fs.createDirectory(folder);
  await openFolder(folder);
  return { kind: "created", folder, fsPath: folder.fsPath };
}

/** Backward-compatible wrapper. */
export async function pickWorkspaceFolder(): Promise<vscode.Uri | null> {
  const picked = await pickOrCreateWorkspace();
  return picked.kind === "cancelled" ? null : picked.folder;
}

export { isPendingWorkspacePath, postConnectPanelMode } from "./connect-flow";
