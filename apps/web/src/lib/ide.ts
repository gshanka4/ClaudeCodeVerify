import {
  DEFAULT_IDE_TARGET,
  type IdeTarget,
  isIdeTarget,
  isLegacyIdeTarget,
  parseIdeTarget,
} from "@architectai/shared";

export type { IdeTarget };
export { DEFAULT_IDE_TARGET, isLegacyIdeTarget, parseIdeTarget };

export interface IdeOption {
  id: IdeTarget;
  label: string;
  description: string;
  recommended?: boolean;
  copyOnly?: boolean;
  legacy?: boolean;
}

/** Claude Code first; legacy GUI IDEs collapsed in picker. */
export const IDE_OPTIONS: IdeOption[] = [
  {
    id: "claude-code",
    label: "Claude Code",
    description: "Writes CLAUDE.md, .mcp.json, and hooks into your repo — recommended",
    recommended: true,
  },
  {
    id: "vscode",
    label: "Visual Studio Code",
    description: "Legacy: extension + on-save drift in VS Code",
    legacy: true,
  },
  {
    id: "cursor",
    label: "Cursor",
    description: "Legacy: deep-link handoff to Cursor",
    legacy: true,
  },
  {
    id: "antigravity",
    label: "Antigravity",
    description: "Copy hand-off link (preview)",
    copyOnly: true,
    legacy: true,
  },
];

export const LEGACY_IDE_OPTIONS = IDE_OPTIONS.filter((o) => o.legacy || o.copyOnly);

const IDE_SCHEMES: Partial<Record<IdeTarget, string>> = {
  vscode: "vscode",
  cursor: "cursor",
  antigravity: "antigravity",
};

export function buildIdeDeepLink(
  ide: IdeTarget,
  token: string,
  architectureId: string,
  workspaceId?: string,
): string {
  if (ide === "claude-code") {
    const params = new URLSearchParams({ token, architectureId });
    if (workspaceId) params.set("workspaceId", workspaceId);
    return `#claude-code-setup?${params.toString()}`;
  }
  const params = new URLSearchParams({ token, architectureId });
  if (workspaceId) params.set("workspaceId", workspaceId);
  const scheme = IDE_SCHEMES[ide];
  if (!scheme) return `#architectai-handoff?${params.toString()}`;
  return `${scheme}://architectai/connect?${params.toString()}`;
}

export function buildCursorDeepLink(
  token: string,
  architectureId: string,
  workspaceId?: string,
): string {
  return buildIdeDeepLink("cursor", token, architectureId, workspaceId);
}

export function ideLabel(ide: IdeTarget): string {
  return IDE_OPTIONS.find((o) => o.id === ide)?.label ?? ide;
}

export function launchIdeHandoff(deepLink: string, ide: IdeTarget): "launched" | "copy-only" {
  if (ide === "claude-code" || ide === "antigravity") return "copy-only";
  if (deepLink.startsWith("#")) return "copy-only";
  window.location.href = deepLink;
  return "launched";
}

export function parseIdeQueryParam(search: string): IdeTarget {
  const raw = new URLSearchParams(search).get("ide");
  return parseIdeTarget(raw);
}

export function exportWizardPath(architectureId: string, ide: IdeTarget): string {
  return `/export/${architectureId}?ide=${ide}`;
}

export function isExportableStatus(status: string): boolean {
  return status === "ready";
}

export function ideNeedsWizardFallback(ide: IdeTarget): boolean {
  return ide === "vscode" || ide === "cursor";
}

export { isIdeTarget };
