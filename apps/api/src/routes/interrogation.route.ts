import { Router } from "express";
import type { AppContext } from "@/context";
import { interrogationController } from "@/controllers/interrogation.controller";

/** /api/interrogate — adaptive interrogation (Phase 2). */
export function createInterrogationRouter(ctx: AppContext): Router {
  const router = Router();
  const c = interrogationController(ctx);

  router.post("/start", c.start);
  router.get("/sessions", c.listSessions);
  router.get("/:sessionId", c.getSession);
  router.post("/:sessionId/answer", c.answer);
  router.post("/:sessionId/skip", c.skip);
  router.patch("/:sessionId/edit/:questionId", c.edit);

  return router;
}
