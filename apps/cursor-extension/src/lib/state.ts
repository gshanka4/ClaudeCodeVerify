import type { CursorConfig, DriftEvent } from "@architectai/shared";

export type PanelMode = "setup" | "normal" | "drift";

export interface ExtensionState {
  token: string | null;
  workspaceId: string | null;
  config: CursorConfig | null;
  panelMode: PanelMode;
  openDrifts: DriftEvent[];
  selectedDriftIndex: number;
  monitoringPaused: boolean;
  dismissedDriftIds: Set<string>;
  exportBundleJson: string | null;
}

export function createInitialState(): ExtensionState {
  return {
    token: null,
    workspaceId: null,
    config: null,
    panelMode: "setup",
    openDrifts: [],
    selectedDriftIndex: 0,
    monitoringPaused: false,
    dismissedDriftIds: new Set(),
    exportBundleJson: null,
  };
}

export function criticalDriftCount(drifts: DriftEvent[]): number {
  return drifts.filter((d) => d.severity === "critical" || d.severity === "high").length;
}

export function statusBarLabel(drifts: DriftEvent[]): string | null {
  const n = criticalDriftCount(drifts);
  if (n === 0) return null;
  return `⚠ ${n} Critical Drift`;
}

export function applyFixToContent(
  fileContent: string,
  drift: DriftEvent,
): { content: string; applied: boolean; conflict: boolean } {
  const fix = drift.autoFix;
  if (!fix || fix.hunks.length === 0) {
    return { content: fileContent, applied: false, conflict: false };
  }
  const hunk = fix.hunks[0]!;
  const lines = fileContent.split("\n");
  const removedJoined = hunk.removed.join("\n");
  const currentSlice = lines.slice(hunk.lineStart - 1, hunk.lineStart - 1 + hunk.removed.length);
  if (currentSlice.join("\n") !== removedJoined) {
    return { content: fileContent, applied: false, conflict: true };
  }
  const next = [
    ...lines.slice(0, hunk.lineStart - 1),
    ...hunk.added,
    ...lines.slice(hunk.lineStart - 1 + hunk.removed.length),
  ];
  return { content: next.join("\n"), applied: true, conflict: false };
}
