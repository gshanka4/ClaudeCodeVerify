import type { RequestHandler } from "express";
import { z } from "zod";
import type { AppContext } from "@/context";
import { withTenant } from "@/db/client";
import { formatSseEvent } from "@/generation/runner";
import { accepted, ok } from "@/lib/http";
import { parseOrThrow } from "@/lib/validate";
import * as generationService from "@/services/generation.service";

const sessionIdBody = z.object({
  sessionId: z.string().uuid(),
  slowMode: z.boolean().optional(),
});

const architectureIdParam = z.string().uuid();

export interface GenerationController {
  start: RequestHandler;
  stream: RequestHandler;
  cancel: RequestHandler;
  jobStatus: RequestHandler;
}

export function generationController(ctx: AppContext): GenerationController {
  const { db, genHub } = ctx;

  return {
    start: (req, res, next) => {
      if (process.env.E2E_FAIL_NEXT_GENERATE_START === "1") {
        delete process.env.E2E_FAIL_NEXT_GENERATE_START;
        res.status(500).json({ code: "err", message: "fail" });
        return;
      }
      const auth = req.auth!;
      const body = parseOrThrow(sessionIdBody, req.body);
      const failAfterEvents =
        process.env.NODE_ENV !== "production" &&
        req.headers["x-test-generation-error"] === "1"
          ? 2
          : undefined;

      withTenant(db, auth, (tx) => generationService.startGeneration(tx, auth, body))
        .then(async (result) => {
          const reschedule =
            !result.deduped ||
            (await generationService.shouldRescheduleGeneration(genHub, result.architectureId));
          if (reschedule) {
            generationService.scheduleGenerationJob(
              db,
              genHub,
              ctx.verifyHub,
              ctx.llm,
              auth,
              result.architectureId,
              body.sessionId,
              {
              slowMode: body.slowMode,
              failAfterEvents,
              reinit: reschedule && result.deduped,
            });
          }
          accepted(res, {
            architectureId: result.architectureId,
            streamUrl: result.streamUrl,
          });
        })
        .catch(next);
    },

    jobStatus: (req, res, next) => {
      const architectureId = parseOrThrow(architectureIdParam, req.params.architectureId);
      generationService
        .getGenerationJobStatus(genHub, architectureId)
        .then((status) => {
          if (!status) {
            res.status(404).json({ code: "not_found", message: "Generation job not found" });
            return;
          }
          ok(res, status);
        })
        .catch(next);
    },

    stream: async (req, res, next) => {
      try {
        const architectureId = parseOrThrow(architectureIdParam, req.params.architectureId);
        const lastEventId = req.headers["last-event-id"];
        let afterSeq = 0;
        if (typeof lastEventId === "string") afterSeq = Number.parseInt(lastEventId, 10) || 0;

        res.setHeader("Content-Type", "text/event-stream");
        res.setHeader("Cache-Control", "no-cache");
        res.setHeader("Connection", "keep-alive");
        res.flushHeaders?.();

        const snap = await genHub.getSnapshot(architectureId);
        if (!snap) {
          res.status(404).end();
          return;
        }

        for (let i = afterSeq; i < snap.events.length; i++) {
          const seq = i + 1;
          res.write(formatSseEvent(seq, snap.events[i]!));
        }

        let cursor = snap.seq;
        const abort = new AbortController();
        req.on("close", () => abort.abort());

        while (!abort.signal.aborted) {
          const nextSnap = await genHub.waitForEvent(architectureId, cursor, abort.signal);
          for (let i = cursor; i < nextSnap.events.length; i++) {
            res.write(formatSseEvent(i + 1, nextSnap.events[i]!));
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

    cancel: (req, res, next) => {
      const auth = req.auth!;
      const architectureId = parseOrThrow(architectureIdParam, req.params.architectureId);
      void genHub.requestCancel(architectureId);
      withTenant(db, auth, (tx) => generationService.cancelGeneration(tx, auth, architectureId))
        .then((result) => ok(res, result))
        .catch(next);
    },
  };
}
