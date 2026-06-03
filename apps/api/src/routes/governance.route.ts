import { Router } from "express";
import type { AppContext } from "@/context";
import { governanceController } from "@/controllers/governance.controller";
import { requireRole } from "@/middleware/auth";

/** /api/governance — ruleset authoring is restricted to owner + governance_lead. */
export function createGovernanceRouter(ctx: AppContext): Router {
  const router = Router();
  const c = governanceController(ctx.db);

  router.get("/rulesets", c.listRulesets);
  router.post("/rulesets", requireRole("owner", "governance_lead"), c.createRuleset);

  return router;
}
