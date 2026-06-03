import type { RequestHandler } from "express";
import { z } from "zod";
import type { AppContext } from "@/context";
import { withTenant } from "@/db/client";
import { formatVerificationSseEvent } from "@/verification/runner";
import { ApiError } from "@/lib/errors";
import { accepted, created, ok } from "@/lib/http";
import { parseOrThrow } from "@/lib/validate";
import {
  assertRunBelongsToArchitecture,
  getComponentVerification,
  getVerificationSummaryForArchitecture,
  recordOverrideWithAudit,
  triggerAndScheduleVerification,
} from "@/services/verification-orchestration.service";

const architectureIdParam = z.string().uuid();
const serviceIdParam = z.string().uuid();
const findingIdParam = z.string().uuid();
const runIdParam = z.string().uuid();

const verifyQuery = z.object({
  force: z
    .union([z.literal("true"), z.literal("false"), z.boolean()])
    .optional()
    .transform((v) => v === true || v === "true"),
});

const overrideBody = z.object({
  reason: z.string().min(10),
});

const FORCE_ROLES = new Set(["owner", "architect", "governance_lead"]);

export interface VerificationController {
  verify: RequestHandler;
  getSummary: RequestHandler;
  getComponent: RequestHandler;
  override: RequestHandler;
  stream: RequestHandler;
}

export function verificationController(ctx: AppContext): VerificationController {
  const { db, verifyHub } = ctx;

  return {
    verify: (req, res, next) => {
      const auth = req.auth!;
      const architectureId = parseOrThrow(architectureIdParam, req.params.architectureId);
      const q = parseOrThrow(verifyQuery, req.query);
      if (q.force && !FORCE_ROLES.has(auth.role)) {
        next(ApiError.forbidden("Only architect or governance_lead can force re-verification"));
        return;
      }

      triggerAndScheduleVerification(db, verifyHub, ctx.llm, auth, {
        architectureId,
        force: q.force,
      })
        .then((result) =>
          accepted(res, { runId: result.runId, streamUrl: result.streamUrl }),
        )
        .catch(next);
    },

    getSummary: (req, res, next) => {
      const auth = req.auth!;
      const architectureId = parseOrThrow(architectureIdParam, req.params.architectureId);
      withTenant(db, auth, (tx) => getVerificationSummaryForArchitecture(tx, architectureId))
        .then((summary) => {
          if (!summary) throw ApiError.notFound("No verification run found");
          ok(res, summary);
        })
        .catch(next);
    },

    getComponent: (req, res, next) => {
      const auth = req.auth!;
      const architectureId = parseOrThrow(architectureIdParam, req.params.architectureId);
      const serviceId = parseOrThrow(serviceIdParam, req.params.serviceId);
      withTenant(db, auth, (tx) => getComponentVerification(tx, architectureId, serviceId))
        .then((result) => {
          if (!result) throw ApiError.notFound("No verification run found");
          ok(res, result);
        })
        .catch(next);
    },

    override: (req, res, next) => {
      const auth = req.auth!;
      const architectureId = parseOrThrow(architectureIdParam, req.params.architectureId);
      const findingId = parseOrThrow(findingIdParam, req.params.findingId);
      const body = parseOrThrow(overrideBody, req.body);
      withTenant(db, auth, (tx) =>
        recordOverrideWithAudit(tx, auth, architectureId, findingId, body.reason),
      )
        .then((result) => created(res, result))
        .catch(next);
    },

    stream: async (req, res, next) => {
      try {
        const auth = req.auth!;
        const architectureId = parseOrThrow(architectureIdParam, req.params.architectureId);
        const runId = parseOrThrow(runIdParam, req.params.runId);
        const lastEventId = req.headers["last-event-id"];
        let afterSeq = 0;
        if (typeof lastEventId === "string") afterSeq = Number.parseInt(lastEventId, 10) || 0;

        await withTenant(db, auth, (tx) =>
          assertRunBelongsToArchitecture(tx, architectureId, runId),
        );

        res.setHeader("Content-Type", "text/event-stream");
        res.setHeader("Cache-Control", "no-cache");
        res.setHeader("Connection", "keep-alive");
        res.flushHeaders?.();

        const snap = await verifyHub.getSnapshot(runId);
        if (!snap) {
          res.status(404).end();
          return;
        }

        for (let i = afterSeq; i < snap.events.length; i++) {
          res.write(formatVerificationSseEvent(i + 1, snap.events[i]!));
        }

        let cursor = snap.seq;
        const abort = new AbortController();
        req.on("close", () => abort.abort());

        while (!abort.signal.aborted) {
          const nextSnap = await verifyHub.waitForEvent(runId, cursor, abort.signal);
          for (let i = cursor; i < nextSnap.events.length; i++) {
            res.write(formatVerificationSseEvent(i + 1, nextSnap.events[i]!));
          }
          cursor = nextSnap.seq;
          if (nextSnap.status !== "running") break;
        }
        res.end();
      } catch (err) {
        if ((err as Error).message === "aborted") {
          res.end();
          return;
        }
        next(err);
      }
    },
  };
}

export async function scheduleVerifyAfterVersionBump(
  ctx: AppContext,
  auth: Parameters<typeof triggerAndScheduleVerification>[3],
  architectureId: string,
): Promise<void> {
  await triggerAndScheduleVerification(ctx.db, ctx.verifyHub, ctx.llm, auth, { architectureId });
}
