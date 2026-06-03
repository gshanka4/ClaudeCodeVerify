import type { IdeTarget } from "@architectai/shared";

const IDE_SCHEMES: Partial<Record<IdeTarget, string>> = {
  vscode: "vscode",
  cursor: "cursor",
  antigravity: "antigravity",
};

/** Builds IDE hand-off deep link (shared with web `lib/ide.ts`). */
export function buildIdeDeepLink(
  ide: IdeTarget,
  token: string,
  architectureId: string,
  workspaceId?: string,
  handoffSessionId?: string,
): string {
  const params = new URLSearchParams({ token, architectureId });
  if (workspaceId) params.set("workspaceId", workspaceId);
  if (handoffSessionId) params.set("handoffSessionId", handoffSessionId);
  if (ide === "claude-code") {
    return `#claude-code-setup?${params.toString()}`;
  }
  const scheme = IDE_SCHEMES[ide];
  if (!scheme) return `#architectai-handoff?${params.toString()}`;
  return `${scheme}://architectai/connect?${params.toString()}`;
}
