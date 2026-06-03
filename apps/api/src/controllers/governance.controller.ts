import type { RequestHandler } from "express";
import { z } from "zod";
import type { AppDatabase } from "@/db/client";
import { withTenant } from "@/db/client";
import { created, ok } from "@/lib/http";
import { parseOrThrow } from "@/lib/validate";
import { recordAudit } from "@/services/audit.service";
import * as service from "@/services/governance.service";

const createBody = z.object({
  name: z.string().trim().min(1).max(200),
  description: z.string().max(2000).optional(),
  isDefault: z.boolean().optional(),
});

export interface GovernanceController {
  listRulesets: RequestHandler;
  createRuleset: RequestHandler;
}

export function governanceController(db: AppDatabase): GovernanceController {
  return {
    listRulesets: (req, res, next) => {
      const auth = req.auth!;
      withTenant(db, auth, (tx) => service.listRulesets(tx))
        .then((rows) => ok(res, rows))
        .catch(next);
    },

    createRuleset: (req, res, next) => {
      const auth = req.auth!;
      const body = parseOrThrow(createBody, req.body);
      withTenant(db, auth, async (tx) => {
        const ruleset = await service.createRuleset(tx, {
          organizationId: auth.organizationId,
          createdById: auth.userId,
          name: body.name,
          description: body.description,
          isDefault: body.isDefault,
        });
        await recordAudit(tx, {
          organizationId: auth.organizationId,
          userId: auth.userId,
          eventType: "governance.ruleset.created",
          resourceType: "governance_ruleset",
          resourceId: ruleset.id,
          payload: { name: ruleset.name, isDefault: ruleset.isDefault },
        });
        return ruleset;
      })
        .then((ruleset) => created(res, ruleset))
        .catch(next);
    },
  };
}
