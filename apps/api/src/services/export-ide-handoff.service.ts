import {
  DEFAULT_IDE_TARGET,
  isLegacyIdeTarget,
  parseIdeTarget,
  type IdeTarget,
} from "@architectai/shared";
import { desc, eq } from "drizzle-orm";
import type { AppTx } from "@/db/client";
import { schema } from "@/db/schema";
import { buildIdeDeepLink } from "@/lib/ide-deeplink";
import type { AuthContext } from "@/middleware/auth";
import * as exportService from "@/services/export.service";
import * as workspaceService from "@/services/workspace.service";
import * as handoffSession from "@/services/handoff-session.service";

export interface ExportIdeHandoffResult {
  deepLink: string;
  ide: IdeTarget;
  workspaceId: string;
  exportId: string;
  bundleReady: boolean;
  handoffSessionId: string;
  claudeCodeFiles?: Record<string, string>;
  setupCommand?: string;
}

function publicApiBase(): string {
  return (
    process.env.PUBLIC_API_URL ??
    process.env.API_PUBLIC_URL ??
    `http://127.0.0.1:${process.env.PORT ?? 4000}`
  );
}

function injectClaudeCodeCredentials(
  files: Record<string, string>,
  token: string,
  architectureId: string,
): Record<string, string> {
  const out = { ...files };
  const apiBase = publicApiBase();
  try {
    const mcp = JSON.parse(out[".mcp.json"] ?? "{}") as {
      mcpServers?: Record<string, { env?: Record<string, string> }>;
    };
    if (mcp.mcpServers?.architectai?.env) {
      mcp.mcpServers.architectai.env.ARCHITECTAI_WORKSPACE_TOKEN = token;
      mcp.mcpServers.architectai.env.ARCHITECTAI_API_URL = apiBase;
      out[".mcp.json"] = JSON.stringify(mcp, null, 2);
    }
  } catch {
    /* keep template */
  }
  const creds = {
    apiBaseUrl: apiBase,
    workspaceToken: token,
    architectureId,
    monitoredPaths: ["src/"],
    ignoredPaths: ["node_modules/", "dist/", ".git/"],
  };
  out[".architectai/credentials.json"] = JSON.stringify(creds, null, 2);
  out[".architectai/credentials.example.json"] = JSON.stringify(
    {
      ...creds,
      workspaceToken: "YOUR_WORKSPACE_TOKEN",
      note: "Add .architectai/credentials.json to .gitignore.",
    },
    null,
    2,
  );
  return out;
}

/**
 * Lock + export + workspace row + handoff payload (Claude Code file map or legacy deep link).
 */
export async function createExportIdeHandoff(
  tx: AppTx,
  auth: AuthContext,
  architectureId: string,
  ideQuery?: string | null,
): Promise<ExportIdeHandoffResult> {
  const ide: IdeTarget = parseIdeTarget(ideQuery, DEFAULT_IDE_TARGET);
  const exportFormat = ide === "claude-code" ? "claude-code-bundle" : "cursor-config";

  const exportResult = await exportService.exportArchitecture(
    tx,
    auth,
    architectureId,
    exportFormat,
    ide,
  );

  const [existing] = await tx
    .select()
    .from(schema.cursorWorkspaces)
    .where(eq(schema.cursorWorkspaces.architectureId, architectureId))
    .orderBy(desc(schema.cursorWorkspaces.createdAt))
    .limit(1);

  let workspaceId: string;
  let apiToken: string;

  if (!existing) {
    const reg = await workspaceService.registerWorkspace(tx, {
      organizationId: auth.organizationId,
      userId: auth.userId,
      architectureId,
      workspacePath: `pending:${architectureId}`,
      ideTarget: ide,
    });
    workspaceId = reg.workspaceId;
    apiToken = reg.apiToken;
  } else {
    workspaceId = existing.id;
    apiToken = `ws_${crypto.randomUUID().replace(/-/g, "")}`;
    await tx
      .update(schema.cursorWorkspaces)
      .set({ apiToken, lastConnectedAt: new Date(), ideTarget: ide })
      .where(eq(schema.cursorWorkspaces.id, workspaceId));
  }

  const handoffSessionId = handoffSession.createHandoffSession(
    architectureId,
    auth.organizationId,
  );
  handoffSession.markHandoffIdeOpened(handoffSessionId);

  if (ide === "claude-code") {
    const raw = JSON.parse(exportResult.content) as Record<string, string>;
    const claudeCodeFiles = injectClaudeCodeCredentials(raw, apiToken, architectureId);
    return {
      deepLink: "#claude-code-setup",
      ide,
      workspaceId,
      exportId: exportResult.exportId,
      bundleReady: true,
      handoffSessionId,
      claudeCodeFiles,
      setupCommand: "claude mcp add architectai  # after writing files to your repo",
    };
  }

  const deepLink = buildIdeDeepLink(
    ide,
    apiToken,
    architectureId,
    workspaceId,
    handoffSessionId,
  );
  return {
    deepLink,
    ide,
    workspaceId,
    exportId: exportResult.exportId,
    bundleReady: true,
    handoffSessionId,
  };
}

export { isLegacyIdeTarget };
