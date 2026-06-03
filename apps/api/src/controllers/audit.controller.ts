import type { RequestHandler } from "express";
import { z } from "zod";
import type { AppDatabase } from "@/db/client";
import { withTenant } from "@/db/client";
import { ok } from "@/lib/http";
import { parseOrThrow } from "@/lib/validate";
import * as service from "@/services/audit.service";

const listQuery = z.object({
  resourceType: z.string().max(100).optional(),
  resourceId: z.string().uuid().optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  page: z.coerce.number().int().min(1).default(1),
  perPage: z.coerce.number().int().min(1).max(100).default(50),
});

export interface AuditController {
  list: RequestHandler;
}

export function auditController(db: AppDatabase): AuditController {
  return {
    list: (req, res, next) => {
      const auth = req.auth!;
      const q = parseOrThrow(listQuery, req.query);
      withTenant(db, auth, (tx) =>
        service.listAudit(tx, {
          resourceType: q.resourceType,
          resourceId: q.resourceId,
          from: q.from,
          to: q.to,
          page: q.page,
          perPage: q.perPage,
        }),
      )
        .then((result) =>
          ok(res, result.rows, { total: result.total, page: q.page, perPage: q.perPage }),
        )
        .catch(next);
    },
  };
}
