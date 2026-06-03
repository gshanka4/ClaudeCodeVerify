import type { RequestHandler } from "express";
import { z } from "zod";
import type { AppContext } from "@/context";
import { withTenant } from "@/db/client";
import { created, ok } from "@/lib/http";
import { parseOrThrow } from "@/lib/validate";
import * as service from "@/services/interrogation.service";

const sessionIdParam = z.string().uuid();
const questionIdParam = z.string().uuid();
const INTERROGATION_MIN = 20;

const startBody = z.object({
  prompt: z.string().min(INTERROGATION_MIN).max(50_000),
  importType: z.enum(["jira", "prd", "swagger", "text"]).optional(),
  importUrl: z.string().url().optional().nullable(),
});

const answerBody = z.object({
  questionId: z.string().uuid(),
  selectedOptionId: z.string().nullable().optional(),
  freeformAnswer: z.string().max(5000).nullable().optional(),
});

const skipBody = z.object({
  questionId: z.string().uuid(),
});

const editBody = z.object({
  selectedOptionId: z.string().nullable().optional(),
  freeformAnswer: z.string().max(5000).nullable().optional(),
});

const listSessionsQuery = z.object({
  status: z.enum(["active", "complete"]).default("active"),
  limit: z.coerce.number().int().min(1).max(20).optional(),
});

export interface InterrogationController {
  start: RequestHandler;
  listSessions: RequestHandler;
  getSession: RequestHandler;
  answer: RequestHandler;
  skip: RequestHandler;
  edit: RequestHandler;
}

export function interrogationController(ctx: AppContext): InterrogationController {
  const { db, llm } = ctx;

  return {
    start: (req, res, next) => {
      const auth = req.auth!;
      const body = parseOrThrow(startBody, req.body);
      withTenant(db, auth, (tx) =>
        service.startInterrogation(tx, auth, llm, {
          prompt: body.prompt,
          importType: body.importType,
        }),
      )
        .then((result) =>
          created(res, {
            sessionId: result.session.id,
            session: {
              id: result.session.id,
              status: result.session.status,
              contextGatheringProgress: result.session.contextGatheringProgress,
              governanceCoverageProgress: result.session.governanceCoverageProgress,
              currentQuestionIndex: result.session.currentQuestionIndex,
            },
            firstQuestion: result.firstQuestion,
          }),
        )
        .catch(next);
    },

    listSessions: (req, res, next) => {
      const auth = req.auth!;
      const query = parseOrThrow(listSessionsQuery, req.query);
      withTenant(db, auth, (tx) =>
        service.listInterrogationSessions(tx, auth, {
          status: query.status,
          limit: query.limit,
        }),
      )
        .then((sessions) => ok(res, { sessions }))
        .catch(next);
    },

    getSession: (req, res, next) => {
      const auth = req.auth!;
      const sessionId = parseOrThrow(sessionIdParam, req.params.sessionId);
      withTenant(db, auth, (tx) => service.getInterrogationSession(tx, sessionId))
        .then((session) => ok(res, session))
        .catch(next);
    },

    answer: (req, res, next) => {
      const auth = req.auth!;
      const sessionId = parseOrThrow(sessionIdParam, req.params.sessionId);
      const body = parseOrThrow(answerBody, req.body);
      withTenant(db, auth, (tx) =>
        service.answerQuestion(tx, auth, llm, sessionId, {
          questionId: body.questionId,
          selectedOptionId: body.selectedOptionId,
          freeformAnswer: body.freeformAnswer,
        }),
      )
        .then((result) => ok(res, result))
        .catch(next);
    },

    skip: (req, res, next) => {
      const auth = req.auth!;
      const sessionId = parseOrThrow(sessionIdParam, req.params.sessionId);
      const body = parseOrThrow(skipBody, req.body);
      withTenant(db, auth, (tx) =>
        service.skipQuestion(tx, auth, llm, sessionId, { questionId: body.questionId }),
      )
        .then((result) =>
          ok(res, {
            nextQuestion: result.nextQuestion,
            confidencePenalty: 0,
            canGenerate: result.canGenerate,
          }),
        )
        .catch(next);
    },

    edit: (req, res, next) => {
      const auth = req.auth!;
      const sessionId = parseOrThrow(sessionIdParam, req.params.sessionId);
      const questionId = parseOrThrow(questionIdParam, req.params.questionId);
      const body = parseOrThrow(editBody, req.body);
      withTenant(db, auth, (tx) =>
        service.editQuestion(tx, auth, sessionId, questionId, {
          selectedOptionId: body.selectedOptionId,
          freeformAnswer: body.freeformAnswer,
        }),
      )
        .then((result) => ok(res, result))
        .catch(next);
    },
  };
}
