import { RATE_LIMITS } from "@architectai/config";
import { Router } from "express";
import { architecturesController } from "@/controllers/architectures.controller";
import { verificationController } from "@/controllers/verification.controller";
import { exportController } from "@/controllers/export.controller";
import type { AppContext } from "@/context";
import { requireRole } from "@/middleware/auth";
import { rateLimit } from "@/middleware/rate-limit";

/**
 * /api/architectures — viewers can read; editing roles can mutate.
 * Mounted behind `requireAuth` + the default rate limiter (see routes/index.ts).
 */
export function createArchitecturesRouter(ctx: AppContext): Router {
  const router = Router();
  const c = architecturesController(ctx);
  const v = verificationController(ctx);
  const exp = exportController(ctx);
  const canEdit = requireRole("owner", "architect", "developer");
  const canOverride = requireRole("owner", "architect", "governance_lead");

  router.post(
    "/:architectureId/verify",
    canEdit,
    rateLimit({
      store: ctx.rateLimitStore,
      scope: "verify",
      limit: RATE_LIMITS.verifyPerMinPerUser,
    }),
    v.verify,
  );
  router.get("/:architectureId/verification", v.getSummary);
  router.get("/:architectureId/services/:serviceId/verification", v.getComponent);
  router.post("/:architectureId/findings/:findingId/override", canOverride, v.override);
  router.get("/:architectureId/verification/stream/:runId", v.stream);

  router.get("/", c.list);
  router.post("/", canEdit, c.create);
  router.get("/:architectureId", c.getOne);
  router.get("/:architectureId/ide-handoff", c.ideHandoff);
  router.get("/:architectureId/lineage", c.getLineage);
  router.get("/:architectureId/lineage/topics", c.getLineageTopics);
  router.get("/:architectureId/lineage/decisions/:topicId", c.getDecisionChain);
  router.get("/:architectureId/services/:serviceId/trace", c.getTrace);
  router.post(
    "/:architectureId/services/:serviceId/decision-chat",
    canEdit,
    c.decisionChat,
  );
  router.post("/:architectureId/lock", canEdit, c.lock);
  router.post("/:architectureId/export/ide-handoff", canEdit, c.exportIdeHandoff);
  router.get(
    "/:architectureId/export/handoff-session/:sessionId",
    c.getHandoffSession,
  );
  router.post(
    "/:architectureId/export/handoff-session/:sessionId/report",
    canEdit,
    c.reportHandoffSession,
  );
  router.post("/:architectureId/export", canEdit, exp.export);
  router.post("/:architectureId/ask", c.ask);
  router.patch("/:architectureId", canEdit, c.patch);
  router.delete("/:architectureId", canEdit, c.archive);

  return router;
}
