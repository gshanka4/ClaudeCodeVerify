import type { RequestHandler } from "express";
import { z } from "zod";
import type { AppContext } from "@/context";
import { withTenant } from "@/db/client";
import { ok } from "@/lib/http";
import { parseOrThrow } from "@/lib/validate";
import * as exceptionService from "@/services/exception.service";

const requestBody = z.object({
  driftEventId: z.string().uuid(),
  reason: z.string().min(1).max(500),
  businessJustification: z.string().min(1).max(2000),
  targetResolutionDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

const reviewBody = z.object({
  approved: z.boolean(),
  reviewNotes: z.string().max(2000).optional(),
});

export interface ExceptionController {
  request: RequestHandler;
  review: RequestHandler;
}

export function exceptionController(ctx: AppContext): ExceptionController {
  const request: RequestHandler = (req, res, next) => {
    const auth = req.auth!;
    const body = parseOrThrow(requestBody, req.body);
    withTenant(ctx.db, auth, (tx) => exceptionService.requestException(tx, auth, body))
      .then((r) => ok(res, r))
      .catch(next);
  };

  const review: RequestHandler = (req, res, next) => {
    const auth = req.auth!;
    const exceptionId = parseOrThrow(z.string().uuid(), req.params.exceptionId);
    const body = parseOrThrow(reviewBody, req.body);
    withTenant(ctx.db, auth, (tx) => exceptionService.reviewException(tx, auth, exceptionId, body))
      .then((r) => ok(res, r))
      .catch(next);
  };

  return { request, review };
}
