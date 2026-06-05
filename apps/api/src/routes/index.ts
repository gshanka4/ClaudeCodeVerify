import { RATE_LIMITS } from "@architectai/config";
import { Router } from "express";
import type { AppContext } from "@/context";
import { requireAuth } from "@/middleware/auth";
import { rateLimit } from "@/middleware/rate-limit";
import { createArchitecturesRouter } from "@/routes/architectures.route";
import { createAuditRouter } from "@/routes/audit.route";
import { createGovernanceRouter } from "@/routes/governance.route";
import { createGenerationRouter } from "@/routes/generation.route";
import { createInterrogationRouter } from "@/routes/interrogation.route";
import { createDriftHotPathRouter, createDriftRouter } from "@/routes/drift.route";
import { createExceptionRouter } from "@/routes/exception.route";
import { createAgentHotPathRouter, createAgentRouter } from "@/routes/agent.route";
import { createCursorHotPathRouter, createCursorRouter } from "@/routes/cursor.route";
import { createHealthRouter } from "@/routes/health.route";

/**
 * Root router.
 *   - `/healthz` is public (liveness probe, outside `/api`).
 *   - Everything under `/api` is auth-upfront + rate-limited, then dispatched to
 *     domain routers. Add new domains here as later phases land.
 */
export function createApiRouter(ctx: AppContext): Router {
  const router = Router();

  router.use(createHealthRouter(ctx));

  const api = Router();

  api.use("/drift", createDriftHotPathRouter(ctx));
  api.use("/cursor", createCursorHotPathRouter(ctx));
  api.use("/agent", createAgentHotPathRouter(ctx));

  api.use(
    requireAuth({
      db: ctx.db,
      verifier: ctx.verifier,
      clerkSecretKey: ctx.clerkSecretKey,
    }),
  );
  api.use(
    rateLimit({
      store: ctx.rateLimitStore,
      scope: "default",
      limit: RATE_LIMITS.defaultPerMinPerUser,
    }),
  );

  api.use("/architectures", createArchitecturesRouter(ctx));
  api.use("/interrogate", createInterrogationRouter(ctx));
  api.use("/generate", createGenerationRouter(ctx));
  api.use("/governance", createGovernanceRouter(ctx));
  api.use("/audit", createAuditRouter(ctx));
  api.use("/drift", createDriftRouter(ctx));
  api.use("/exceptions", createExceptionRouter(ctx));
  api.use("/cursor", createCursorRouter(ctx));
  api.use("/agent", createAgentRouter(ctx));

  router.use("/api", api);
  return router;
}
