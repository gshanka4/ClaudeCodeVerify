import { RATE_LIMITS } from "@architectai/config";
import { Router } from "express";
import type { AppContext } from "@/context";
import { generationController } from "@/controllers/generation.controller";
import { rateLimit } from "@/middleware/rate-limit";

export function createGenerationRouter(ctx: AppContext): Router {
  const router = Router();
  const ctrl = generationController(ctx);

  router.post(
    "/start",
    rateLimit({
      store: ctx.rateLimitStore,
      scope: "generate",
      limit: RATE_LIMITS.generatePerMinPerUser,
    }),
    ctrl.start,
  );
  router.get("/jobs/:architectureId/status", ctrl.jobStatus);
  router.get("/stream/:architectureId", ctrl.stream);
  router.post("/:architectureId/cancel", ctrl.cancel);

  return router;
}
