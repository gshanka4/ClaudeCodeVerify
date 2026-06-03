import { Router } from "express";
import type { AppContext } from "@/context";
import { exceptionController } from "@/controllers/exception.controller";
import { requireRole } from "@/middleware/auth";

export function createExceptionRouter(ctx: AppContext): Router {
  const router = Router();
  const c = exceptionController(ctx);
  router.post("/request", c.request);
  router.post(
    "/:exceptionId/review",
    requireRole("governance_lead", "owner"),
    c.review,
  );
  return router;
}
