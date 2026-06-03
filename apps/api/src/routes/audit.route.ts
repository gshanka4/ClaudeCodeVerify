import { Router } from "express";
import type { AppContext } from "@/context";
import { auditController } from "@/controllers/audit.controller";
import { requireRole } from "@/middleware/auth";

/** /api/audit — readable only by governance_lead and owner (compliance surface). */
export function createAuditRouter(ctx: AppContext): Router {
  const router = Router();
  const c = auditController(ctx.db);
  router.get("/", requireRole("owner", "governance_lead"), c.list);
  return router;
}
