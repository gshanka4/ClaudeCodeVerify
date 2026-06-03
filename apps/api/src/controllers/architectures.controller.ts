import { IDE_TARGETS } from "@architectai/shared";
import type { RequestHandler } from "express";
import { z } from "zod";
import type { AppContext } from "@/context";
import { withTenant } from "@/db/client";
import { ApiError } from "@/lib/errors";
import { created, noContent, ok } from "@/lib/http";
import { parseOrThrow } from "@/lib/validate";
import * as service from "@/services/architectures.service";
import { recordAudit } from "@/services/audit.service";
import * as decisionLineageService from "@/services/decision-lineage.service";
import * as exportIdeHandoffService from "@/services/export-ide-handoff.service";
import * as handoffSessionService from "@/services/handoff-session.service";
import * as ideHandoffService from "@/services/ide-handoff.service";
import * as lineageService from "@/services/lineage-read.service";
import { scheduleVerifyAfterVersionBump } from "@/controllers/verification.controller";
import { askArchitecture } from "@/services/workspace-chat.service";

const statusEnum = z.enum(["interrogating", "generating", "ready", "draft", "archived"]);
const envEnum = z.enum(["aws", "gcp", "azure", "on-prem", "multi-cloud"]);

const listQuery = z.object({
  status: statusEnum.optional(),
  search: z.string().trim().max(200).optional(),
  page: z.coerce.number().int().min(1).default(1),
  perPage: z.coerce.number().int().min(1).max(100).default(20),
});

const createBody = z.object({
  name: z.string().trim().min(1).max(200),
  description: z.string().max(2000).optional(),
  environmentTarget: envEnum.optional(),
  tags: z.array(z.string()).max(50).optional(),
});

const patchBody = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  description: z.string().max(2000).optional(),
  tags: z.array(z.string()).max(50).optional(),
});

const idParam = z.string().uuid("architectureId must be a UUID");
const serviceIdParam = z.string().uuid("serviceId must be a UUID");

const askBody = z.object({
  question: z.string().trim().min(1).max(2000),
});

const lineageTopicsQuery = z.object({
  serviceId: z.string().uuid().optional(),
});

const decisionChatBody = z.object({
  message: z.string().trim().min(1).max(4000),
});

const ideTargetEnum = z.enum(IDE_TARGETS);

const ideHandoffQuery = z.object({
  ide: ideTargetEnum.optional(),
});

const exportIdeHandoffBody = z.object({
  ide: ideTargetEnum.optional(),
});

const sessionIdParam = z.string().uuid("sessionId must be a UUID");

const handoffReportBody = z.object({
  phase: z.enum(["workspace_linked", "ide_opened", "failed"]),
});

export interface ArchitecturesController {
  list: RequestHandler;
  create: RequestHandler;
  getOne: RequestHandler;
  getLineage: RequestHandler;
  getLineageTopics: RequestHandler;
  getDecisionChain: RequestHandler;
  getTrace: RequestHandler;
  decisionChat: RequestHandler;
  ideHandoff: RequestHandler;
  exportIdeHandoff: RequestHandler;
  getHandoffSession: RequestHandler;
  reportHandoffSession: RequestHandler;
  lock: RequestHandler;
  ask: RequestHandler;
  patch: RequestHandler;
  archive: RequestHandler;
}

export function architecturesController(ctx: AppContext): ArchitecturesController {
  const db = ctx.db;
  return {
    list: (req, res, next) => {
      const auth = req.auth!;
      const q = parseOrThrow(listQuery, req.query);
      withTenant(db, auth, (tx) =>
        service.listArchitectures(tx, {
          status: q.status,
          search: q.search,
          page: q.page,
          perPage: q.perPage,
        }),
      )
        .then((result) =>
          ok(res, result.rows, { total: result.total, page: q.page, perPage: q.perPage }),
        )
        .catch(next);
    },

    create: (req, res, next) => {
      const auth = req.auth!;
      const body = parseOrThrow(createBody, req.body);
      withTenant(db, auth, async (tx) => {
        const arch = await service.createArchitecture(tx, {
          organizationId: auth.organizationId,
          createdById: auth.userId,
          name: body.name,
          description: body.description,
          environmentTarget: body.environmentTarget,
          tags: body.tags,
        });
        await recordAudit(tx, {
          organizationId: auth.organizationId,
          userId: auth.userId,
          eventType: "architecture.created",
          resourceType: "architecture",
          resourceId: arch.id,
          payload: { name: arch.name },
        });
        return arch;
      })
        .then((arch) => created(res, arch))
        .catch(next);
    },

    getOne: (req, res, next) => {
      const auth = req.auth!;
      const id = parseOrThrow(idParam, req.params.architectureId);
      withTenant(db, auth, (tx) => service.getArchitectureDetail(tx, id))
        .then((arch) => {
          if (!arch) throw ApiError.notFound("Architecture not found");
          ok(res, arch);
        })
        .catch(next);
    },

    getLineage: (req, res, next) => {
      const auth = req.auth!;
      const id = parseOrThrow(idParam, req.params.architectureId);
      withTenant(db, auth, async (tx) => {
        const summary = await service.getArchitecture(tx, id);
        if (!summary) throw ApiError.notFound("Architecture not found");
        if (summary.status === "generating") {
          throw ApiError.conflict("Architecture generation in progress — lineage not ready");
        }
        const lineage = await lineageService.getArchitectureLineage(tx, id);
        return lineage ?? { architectureId: id, nodes: [], edges: [], traces: [] };
      })
        .then((lineage) => ok(res, lineage))
        .catch(next);
    },

    getLineageTopics: (req, res, next) => {
      const auth = req.auth!;
      const id = parseOrThrow(idParam, req.params.architectureId);
      const q = parseOrThrow(lineageTopicsQuery, req.query);
      withTenant(db, auth, async (tx) => {
        const summary = await service.getArchitecture(tx, id);
        if (!summary) throw ApiError.notFound("Architecture not found");
        if (summary.status === "generating") {
          throw ApiError.conflict("Architecture generation in progress — lineage not ready");
        }
        const result = await lineageService.getLineageTopics(tx, id, q.serviceId ?? null);
        return result ?? { topics: [] };
      })
        .then((data) => ok(res, data))
        .catch(next);
    },

    getDecisionChain: (req, res, next) => {
      const auth = req.auth!;
      const id = parseOrThrow(idParam, req.params.architectureId);
      const topicId = parseOrThrow(serviceIdParam, req.params.topicId);
      withTenant(db, auth, async (tx) => {
        const summary = await service.getArchitecture(tx, id);
        if (!summary) throw ApiError.notFound("Architecture not found");
        if (summary.status === "generating") {
          throw ApiError.conflict("Architecture generation in progress");
        }
        const chain = await lineageService.getDecisionChain(tx, id, topicId);
        if (!chain) throw ApiError.notFound("Decision chain not found");
        return chain;
      })
        .then((data) => ok(res, data))
        .catch(next);
    },

    getTrace: (req, res, next) => {
      const auth = req.auth!;
      const id = parseOrThrow(idParam, req.params.architectureId);
      const serviceId = parseOrThrow(serviceIdParam, req.params.serviceId);
      withTenant(db, auth, async (tx) => {
        const summary = await service.getArchitecture(tx, id);
        if (!summary) throw ApiError.notFound("Architecture not found");
        if (summary.status === "generating") {
          throw ApiError.conflict("Architecture generation in progress — trace not ready");
        }
        const trace = await lineageService.resolveDecisionTrace(tx, id, serviceId);
        if (!trace) throw ApiError.notFound("Decision trace not found for service");
        return trace;
      })
        .then((trace) => ok(res, trace))
        .catch(next);
    },

    decisionChat: (req, res, next) => {
      const auth = req.auth!;
      const id = parseOrThrow(idParam, req.params.architectureId);
      const serviceId = parseOrThrow(serviceIdParam, req.params.serviceId);
      const body = parseOrThrow(decisionChatBody, req.body);
      withTenant(db, auth, async (tx) => {
        const summary = await service.getArchitecture(tx, id);
        if (!summary) throw ApiError.notFound("Architecture not found");
        if (summary.status === "generating") {
          throw ApiError.conflict("Architecture generation in progress");
        }
        const detail = await service.getArchitectureDetail(tx, id);
        const svc = detail?.services.find((s) => s.id === serviceId);
        if (!svc) throw ApiError.notFound("Service not found");
        try {
          return await decisionLineageService.chatDecisionLineage(
            tx,
            id,
            serviceId,
            svc.displayName,
            body.message,
          );
        } catch (e) {
          if (e instanceof Error && e.message === "Message is required") {
            throw ApiError.badRequest(e.message);
          }
          throw e;
        }
      })
        .then((result) => ok(res, result))
        .catch(next);
    },

    ideHandoff: (req, res, next) => {
      const auth = req.auth!;
      const id = parseOrThrow(idParam, req.params.architectureId);
      const q = parseOrThrow(ideHandoffQuery, req.query);
      withTenant(db, auth, (tx) => ideHandoffService.createIdeHandoff(tx, id, q.ide ?? null))
        .then((handoff) => ok(res, handoff))
        .catch(next);
    },

    exportIdeHandoff: (req, res, next) => {
      const auth = req.auth!;
      const id = parseOrThrow(idParam, req.params.architectureId);
      const body = parseOrThrow(exportIdeHandoffBody, req.body ?? {});
      withTenant(db, auth, (tx) =>
        exportIdeHandoffService.createExportIdeHandoff(tx, auth, id, body.ide ?? null),
      )
        .then((handoff) => ok(res, handoff))
        .catch(next);
    },

    getHandoffSession: (req, res, next) => {
      try {
        const auth = req.auth!;
        const architectureId = parseOrThrow(idParam, req.params.architectureId);
        const sessionId = parseOrThrow(sessionIdParam, req.params.sessionId);
        const status = handoffSessionService.getHandoffSession(
          sessionId,
          architectureId,
          auth.organizationId,
        );
        if (!status) throw ApiError.notFound("Handoff session not found");
        ok(res, status);
      } catch (err) {
        next(err);
      }
    },

    reportHandoffSession: (req, res, next) => {
      try {
        const auth = req.auth!;
        const architectureId = parseOrThrow(idParam, req.params.architectureId);
        const sessionId = parseOrThrow(sessionIdParam, req.params.sessionId);
        const body = parseOrThrow(handoffReportBody, req.body ?? {});
        const existing = handoffSessionService.getHandoffSession(
          sessionId,
          architectureId,
          auth.organizationId,
        );
        if (!existing) throw ApiError.notFound("Handoff session not found");
        if (body.phase === "workspace_linked") {
          handoffSessionService.markHandoffWorkspaceLinked(sessionId);
        } else if (body.phase === "ide_opened") {
          handoffSessionService.markHandoffIdeOpened(sessionId);
        }
        const status = handoffSessionService.getHandoffSession(
          sessionId,
          architectureId,
          auth.organizationId,
        );
        ok(res, status!);
      } catch (err) {
        next(err);
      }
    },

    lock: (req, res, next) => {
      const auth = req.auth!;
      const id = parseOrThrow(idParam, req.params.architectureId);
      withTenant(db, auth, (tx) => service.lockArchitecture(tx, auth, id))
        .then((result) => ok(res, { architectureId: id, ...result }))
        .catch(next);
    },

    ask: (req, res, next) => {
      const auth = req.auth!;
      const id = parseOrThrow(idParam, req.params.architectureId);
      const body = parseOrThrow(askBody, req.body);
      withTenant(db, auth, (tx) => askArchitecture(tx, id, body.question))
        .then((result) => ok(res, result))
        .catch(next);
    },

    patch: (req, res, next) => {
      const auth = req.auth!;
      const id = parseOrThrow(idParam, req.params.architectureId);
      const body = parseOrThrow(patchBody, req.body);
      let versionBefore = 0;
      let versionAfter = 0;
      withTenant(db, auth, async (tx) => {
        const before = await service.getArchitecture(tx, id);
        if (!before) throw ApiError.notFound("Architecture not found");
        versionBefore = before.version;
        const arch = await service.updateArchitecture(tx, id, body);
        if (!arch) throw ApiError.notFound("Architecture not found");
        versionAfter = arch.version;
        await recordAudit(tx, {
          organizationId: auth.organizationId,
          userId: auth.userId,
          eventType: "architecture.updated",
          resourceType: "architecture",
          resourceId: id,
          payload: body,
        });
        return arch;
      })
        .then(async (arch) => {
          if (versionAfter > versionBefore) {
            await scheduleVerifyAfterVersionBump(ctx, auth, id);
          }
          ok(res, arch);
        })
        .catch(next);
    },

    archive: (req, res, next) => {
      const auth = req.auth!;
      const id = parseOrThrow(idParam, req.params.architectureId);
      withTenant(db, auth, async (tx) => {
        const okFlag = await service.archiveArchitecture(tx, id);
        if (!okFlag) throw ApiError.notFound("Architecture not found");
        await recordAudit(tx, {
          organizationId: auth.organizationId,
          userId: auth.userId,
          eventType: "architecture.archived",
          resourceType: "architecture",
          resourceId: id,
        });
      })
        .then(() => noContent(res))
        .catch(next);
    },
  };
}
