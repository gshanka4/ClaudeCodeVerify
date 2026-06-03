import { createHash } from "node:crypto";
import { eq } from "drizzle-orm";
import type { CursorConfig, IdeTarget } from "@architectai/shared";
import type { AppTx } from "@/db/client";
import { schema } from "@/db/schema";
import { ApiError } from "@/lib/errors";
import { buildCursorConfig } from "@/services/cursor-config.service";

export interface RegisterWorkspaceInput {
  organizationId: string;
  userId: string;
  architectureId: string;
  workspacePath: string;
  monitoredPaths?: string[];
  ignoredPaths?: string[];
  ideTarget?: IdeTarget;
}

export interface RegisteredWorkspace {
  workspaceId: string;
  apiToken: string;
  cursorConfig: CursorConfig;
}

export async function registerWorkspace(
  tx: AppTx,
  input: RegisterWorkspaceInput,
): Promise<RegisteredWorkspace> {
  const hash = createHash("sha256").update(input.workspacePath).digest("hex").slice(0, 16);
  const apiToken = `ws_${crypto.randomUUID().replace(/-/g, "")}`;

  const [row] = await tx
    .insert(schema.cursorWorkspaces)
    .values({
      organizationId: input.organizationId,
      userId: input.userId,
      architectureId: input.architectureId,
      workspacePath: input.workspacePath,
      workspaceHash: hash,
      apiToken,
      monitoredPaths: input.monitoredPaths ?? ["src/"],
      ignoredPaths: input.ignoredPaths ?? ["node_modules/", "dist/", ".git/"],
      ideTarget: input.ideTarget ?? "cursor",
      lastConnectedAt: new Date(),
    })
    .returning();

  const cursorConfig = await buildCursorConfig(tx, row!);
  return { workspaceId: row!.id, apiToken: row!.apiToken, cursorConfig };
}

export async function getWorkspaceRow(
  tx: AppTx,
  workspaceId: string,
): Promise<typeof schema.cursorWorkspaces.$inferSelect | null> {
  const [row] = await tx
    .select()
    .from(schema.cursorWorkspaces)
    .where(eq(schema.cursorWorkspaces.id, workspaceId))
    .limit(1);
  return row ?? null;
}

export async function getWorkspaceByToken(
  tx: AppTx,
  token: string,
): Promise<typeof schema.cursorWorkspaces.$inferSelect | null> {
  const [row] = await tx
    .select()
    .from(schema.cursorWorkspaces)
    .where(eq(schema.cursorWorkspaces.apiToken, token))
    .limit(1);
  return row ?? null;
}

export async function updateWorkspacePath(
  tx: AppTx,
  workspaceId: string,
  workspacePath: string,
): Promise<typeof schema.cursorWorkspaces.$inferSelect> {
  const normalized = workspacePath.trim();
  if (!normalized || normalized.startsWith("pending:")) {
    throw ApiError.badRequest("workspacePath must be a real folder path");
  }
  const workspaceHash = createHash("sha256").update(normalized).digest("hex").slice(0, 16);
  const [updated] = await tx
    .update(schema.cursorWorkspaces)
    .set({
      workspacePath: normalized,
      workspaceHash,
      lastConnectedAt: new Date(),
    })
    .where(eq(schema.cursorWorkspaces.id, workspaceId))
    .returning();

  if (!updated) throw ApiError.notFound("Workspace not found");
  return updated;
}
