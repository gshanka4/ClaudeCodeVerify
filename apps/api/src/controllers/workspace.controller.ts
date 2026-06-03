import { IDE_TARGETS } from "@architectai/shared";
import type { RequestHandler } from "express";
import { z } from "zod";
import type { AppContext } from "@/context";
import { withTenant } from "@/db/client";
import { created, ok } from "@/lib/http";
import { parseOrThrow } from "@/lib/validate";
import { buildCursorConfig } from "@/services/cursor-config.service";
import * as exportBundleService from "@/services/export-bundle.service";
import * as handoffSessionService from "@/services/handoff-session.service";
import * as workspaceService from "@/services/workspace.service";
import { ApiError } from "@/lib/errors";

const registerBody = z.object({
  architectureId: z.string().uuid(),
  workspacePath: z.string().min(1).max(500),
  monitoredPaths: z.array(z.string()).optional(),
  ignoredPaths: z.array(z.string()).optional(),
  ideTarget: z.enum(IDE_TARGETS).optional(),
});

const patchPathBody = z.object({
  workspacePath: z.string().min(1).max(500),
});

const handoffLinkedBody = z.object({
  handoffSessionId: z.string().uuid(),
});

export interface WorkspaceController {
  register: RequestHandler;
  patchPath: RequestHandler;
  reportHandoffLinked: RequestHandler;
  getConfig: RequestHandler;
  getExportBundle: RequestHandler;
}

export function workspaceController(ctx: AppContext): WorkspaceController {
  const register: RequestHandler = (req, res, next) => {
    const auth = req.auth!;
    const body = parseOrThrow(registerBody, req.body);
    withTenant(ctx.db, auth, (tx) =>
      workspaceService.registerWorkspace(tx, {
        organizationId: auth.organizationId,
        userId: auth.userId,
        architectureId: body.architectureId,
        workspacePath: body.workspacePath,
        monitoredPaths: body.monitoredPaths,
        ignoredPaths: body.ignoredPaths,
        ideTarget: body.ideTarget,
      }),
    )
      .then((r) =>
        created(res, {
          workspaceId: r.workspaceId,
          apiToken: r.apiToken,
          cursorConfig: r.cursorConfig,
        }),
      )
      .catch(next);
  };

  const getConfig: RequestHandler = (req, res, next) => {
    const workspace = req.workspace!;
    withTenant(
      ctx.db,
      { organizationId: workspace.organizationId, userId: workspace.userId, role: "developer" },
      async (tx) => {
        const row = await workspaceService.getWorkspaceRow(tx, workspace.workspaceId);
        if (!row) throw ApiError.notFound("Workspace not found");
        return buildCursorConfig(tx, row);
      },
    )
      .then((config) => ok(res, { cursorConfig: config }))
      .catch(next);
  };

  const patchPath: RequestHandler = (req, res, next) => {
    const workspace = req.workspace!;
    const body = parseOrThrow(patchPathBody, req.body);
    withTenant(
      ctx.db,
      { organizationId: workspace.organizationId, userId: workspace.userId, role: "developer" },
      (tx) => workspaceService.updateWorkspacePath(tx, workspace.workspaceId, body.workspacePath),
    )
      .then(() =>
        ok(res, {
          workspaceId: workspace.workspaceId,
          workspacePath: body.workspacePath.trim(),
        }),
      )
      .catch(next);
  };

  const reportHandoffLinked: RequestHandler = (req, res, next) => {
    try {
      const workspace = req.workspace!;
      const body = parseOrThrow(handoffLinkedBody, req.body ?? {});
      const existing = handoffSessionService.getHandoffSession(
        body.handoffSessionId,
        workspace.architectureId,
        workspace.organizationId,
      );
      if (!existing) throw ApiError.notFound("Handoff session not found");
      handoffSessionService.markHandoffWorkspaceLinked(body.handoffSessionId);
      const status = handoffSessionService.getHandoffSession(
        body.handoffSessionId,
        workspace.architectureId,
        workspace.organizationId,
      );
      ok(res, status!);
    } catch (err) {
      next(err);
    }
  };

  const getExportBundle: RequestHandler = (req, res, next) => {
    const workspace = req.workspace!;
    withTenant(
      ctx.db,
      { organizationId: workspace.organizationId, userId: workspace.userId, role: "developer" },
      (tx) =>
        exportBundleService.getExportBundleForWorkspace(
          tx,
          workspace.workspaceId,
          workspace.architectureId,
        ),
    )
      .then((bundle) => ok(res, bundle))
      .catch(next);
  };

  return { register, patchPath, reportHandoffLinked, getConfig, getExportBundle };
}
