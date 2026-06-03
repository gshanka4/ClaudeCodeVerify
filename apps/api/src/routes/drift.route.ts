import { RATE_LIMITS } from "@architectai/config";
import { Router } from "express";
import type { AppContext } from "@/context";
import { driftController } from "@/controllers/drift.controller";
import { requireWorkspaceToken } from "@/middleware/workspace-auth";
import { rateLimit } from "@/middleware/rate-limit";

export function createDriftHotPathRouter(ctx: AppContext): Router {
  const router = Router();
  const c = driftController(ctx);
  router.post(
    "/check",
    requireWorkspaceToken(ctx.db),
    rateLimit({
      store: ctx.rateLimitStore,
      scope: "drift",
      limit: RATE_LIMITS.driftPerMinPerWorkspace,
      keyFn: (req) => req.workspace!.workspaceId,
    }),
    c.check,
  );
  router.post("/workspace/:driftId/apply-fix", requireWorkspaceToken(ctx.db), c.applyFix);
  router.post("/workspace/:driftId/ignore", requireWorkspaceToken(ctx.db), c.ignore);
  return router;
}

export function createDriftRouter(ctx: AppContext): Router {
  const router = Router();
  const c = driftController(ctx);
  router.get("/:architectureId", c.list);
  router.post("/:driftId/apply-fix", c.applyFix);
  router.post("/:driftId/ignore", c.ignore);
  return router;
}
