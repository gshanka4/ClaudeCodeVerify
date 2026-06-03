/** Agent runtime / IDE hand-off targets (REQ-3, Phase C, Claude Code pivot). */
export const IDE_TARGETS = ["claude-code", "vscode", "cursor", "antigravity"] as const;
export type IdeTarget = (typeof IDE_TARGETS)[number];

/** Default export runtime — Claude Code (terminal agent). */
export const DEFAULT_IDE_TARGET: IdeTarget = "claude-code";

export const LEGACY_IDE_TARGETS = ["vscode", "cursor", "antigravity"] as const satisfies readonly IdeTarget[];

export function isLegacyIdeTarget(ide: IdeTarget): boolean {
  return (LEGACY_IDE_TARGETS as readonly string[]).includes(ide);
}

export function isIdeTarget(value: string | null | undefined): value is IdeTarget {
  return IDE_TARGETS.includes(value as IdeTarget);
}

export function parseIdeTarget(
  value: string | null | undefined,
  fallback: IdeTarget = DEFAULT_IDE_TARGET,
): IdeTarget {
  return isIdeTarget(value) ? value : fallback;
}

/** Fresh IDE hand-off from dashboard (REQ-4) — token is not stored in list APIs. */
export interface IdeHandoffResponse {
  deepLink: string;
  ide: IdeTarget;
  workspaceId: string;
}

/** One-click export + IDE launch from workspace (Phase I / REQ-11). */
export interface ExportIdeHandoffResponse extends IdeHandoffResponse {
  exportId: string;
  bundleReady: boolean;
  /** CHG-2: optional session for web polling / extension report-ready. */
  handoffSessionId?: string;
  /** Claude Code: repo file map (no deep-link protocol). */
  claudeCodeFiles?: Record<string, string>;
  /** Claude Code: one-line setup hint for terminal users. */
  setupCommand?: string;
}

export type HandoffSessionPhase =
  | "pending"
  | "ide_opened"
  | "workspace_linked"
  | "failed";

export interface HandoffSessionStatus {
  sessionId: string;
  phase: HandoffSessionPhase;
  architectureId: string;
}

/** Extension pulls latest export bundle with scoped workspace token (Phase I). */
export interface ExportBundleResponse {
  format: "cursor-config";
  content: string;
  exportId: string;
  bundleKeys: string[];
}

export const ARCHITECTAI_EXTENSION_ID = "architectai.architectai";
export const VSCODE_EXTENSION_INSTALL_URI = `vscode:extension/${ARCHITECTAI_EXTENSION_ID}`;
