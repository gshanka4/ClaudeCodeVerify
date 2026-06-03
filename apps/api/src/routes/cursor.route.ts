import { Router } from "express";
import type { AppContext } from "@/context";
import { workspaceController } from "@/controllers/workspace.controller";
import { requireWorkspaceTokenForId } from "@/middleware/workspace-auth";

export function createCursorHotPathRouter(ctx: AppContext): Router {
  const router = Router();
  const c = workspaceController(ctx);
  router.get(
    "/workspaces/:workspaceId/config",
    requireWorkspaceTokenForId(ctx.db),
    c.getConfig,
  );
  router.get(
    "/workspaces/:workspaceId/export-bundle",
    requireWorkspaceTokenForId(ctx.db),
    c.getExportBundle,
  );
  router.patch(
    "/workspaces/:workspaceId",
    requireWorkspaceTokenForId(ctx.db),
    c.patchPath,
  );
  router.post(
    "/workspaces/:workspaceId/handoff-linked",
    requireWorkspaceTokenForId(ctx.db),
    c.reportHandoffLinked,
  );
  return router;
}

export function createCursorRouter(ctx: AppContext): Router {
  const router = Router();
  const c = workspaceController(ctx);
  router.post("/workspaces", c.register);
  return router;
}
