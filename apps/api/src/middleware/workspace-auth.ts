import { eq } from "drizzle-orm";
import type { RequestHandler } from "express";
import type { AppDatabase } from "@/db/client";
import { schema } from "@/db/schema";
import { ApiError } from "@/lib/errors";

export interface WorkspaceContext {
  workspaceId: string;
  organizationId: string;
  architectureId: string;
  userId: string;
}

const BEARER = /^Bearer\s+(.+)$/i;

/**
 * Scoped workspace token auth for POST /drift/check (P5-EC-12).
 * Rejects user JWTs that are not registered workspace tokens.
 */
async function resolveWorkspaceToken(
  db: AppDatabase,
  token: string,
  expectedWorkspaceId?: string,
): Promise<WorkspaceContext> {
  const [row] = await db
    .select()
    .from(schema.cursorWorkspaces)
    .where(eq(schema.cursorWorkspaces.apiToken, token))
    .limit(1);
  if (!row) throw ApiError.unauthorized("Invalid workspace token");
  if (expectedWorkspaceId && row.id !== expectedWorkspaceId) {
    throw ApiError.forbidden("Workspace token does not match workspace id");
  }
  return {
    workspaceId: row.id,
    organizationId: row.organizationId,
    architectureId: row.architectureId,
    userId: row.userId,
  };
}

export function requireWorkspaceToken(db: AppDatabase): RequestHandler {
  return (req, _res, next) => {
    void (async () => {
      const header = req.header("authorization");
      const match = header ? BEARER.exec(header) : null;
      const token = match?.[1]?.trim();
      if (!token) throw ApiError.unauthorized("Missing workspace token");
      req.workspace = await resolveWorkspaceToken(db, token);
    })()
      .then(() => next())
      .catch(next);
  };
}

/** Token auth scoped to a workspace id path param (P6-IT-03). */
export function requireWorkspaceTokenForId(db: AppDatabase): RequestHandler {
  return (req, _res, next) => {
    void (async () => {
      const header = req.header("authorization");
      const match = header ? BEARER.exec(header) : null;
      const token = match?.[1]?.trim();
      if (!token) throw ApiError.unauthorized("Missing workspace token");
      const rawId = req.params.workspaceId;
      const workspaceId = Array.isArray(rawId) ? rawId[0] : rawId;
      if (!workspaceId) throw ApiError.badRequest("Missing workspace id");
      req.workspace = await resolveWorkspaceToken(db, token, workspaceId);
    })()
      .then(() => next())
      .catch(next);
  };
}
