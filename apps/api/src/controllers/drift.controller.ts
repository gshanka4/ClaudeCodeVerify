import type { RequestHandler } from "express";
import { z } from "zod";
import type { AppContext } from "@/context";
import { withTenant } from "@/db/client";
import { ApiError } from "@/lib/errors";
import { ok } from "@/lib/http";
import { parseOrThrow } from "@/lib/validate";
import type { AuthContext } from "@/middleware/auth";
import type { WorkspaceContext } from "@/middleware/workspace-auth";
import { scheduleDriftEnrichment } from "@/services/drift-enrichment";
import * as driftService from "@/services/drift.service";
const checkBody = z.object({
  architectureId: z.string().uuid(),
  filePath: z.string().min(1).max(500),
  fileContent: z.string().max(500_000),
});

const idParam = z.string().uuid();

function authFromRequest(req: {
  auth?: AuthContext;
  workspace?: WorkspaceContext;
}): AuthContext {
  if (req.auth) return req.auth;
  const w = req.workspace;
  if (!w) throw ApiError.unauthorized("Authentication required");
  return {
    organizationId: w.organizationId,
    userId: w.userId,
    role: "developer",
    clerkId: "workspace",
    email: "workspace@architectai.local",
  };
}

export interface DriftController {
  check: RequestHandler;
  list: RequestHandler;
  applyFix: RequestHandler;
  ignore: RequestHandler;
}

export function driftController(ctx: AppContext): DriftController {
  const engine = ctx.driftEngine;

  const check: RequestHandler = (req, res, next) => {
    const workspace = req.workspace!;
    const body = parseOrThrow(checkBody, req.body);
    withTenant(
      ctx.db,
      { organizationId: workspace.organizationId, userId: workspace.userId, role: "developer" },
      (tx) => driftService.checkDrift(tx, workspace, engine, body),
    )
      .then((result) => {
        const { workspaceId, ...data } = result;
        ok(res, { ...data, currentDriftScore: data.newDriftScore });
        for (const d of data.drifts) {
          scheduleDriftEnrichment(ctx.driftHub, workspaceId, d);
        }
      })
      .catch(next);
  };

  const list: RequestHandler = (req, res, next) => {
    const auth = req.auth!;
    const architectureId = parseOrThrow(idParam, req.params.architectureId);
    withTenant(ctx.db, auth, (tx) => driftService.listDriftEvents(tx, architectureId))
      .then((rows) => ok(res, rows))
      .catch(next);
  };

  const applyFix: RequestHandler = (req, res, next) => {
    const auth = authFromRequest(req);
    const driftId = parseOrThrow(idParam, req.params.driftId);
    withTenant(ctx.db, auth, (tx) => driftService.applyDriftFix(tx, auth, driftId))
      .then((r) => ok(res, r))
      .catch(next);
  };

  const ignore: RequestHandler = (req, res, next) => {
    const auth = authFromRequest(req);
    const driftId = parseOrThrow(idParam, req.params.driftId);
    withTenant(ctx.db, auth, (tx) => driftService.ignoreDrift(tx, auth, driftId))
      .then((r) => ok(res, r))
      .catch(next);
  };

  return { check, list, applyFix, ignore };
}
