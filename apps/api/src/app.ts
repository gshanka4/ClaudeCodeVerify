import express, { type Express } from "express";
import type { AppContext } from "@/context";
import { webCors } from "@/middleware/web-cors";
import { errorHandler, notFoundHandler } from "@/middleware/error-handler";
import { createOpenApiValidator, resolveSpecPath } from "@/middleware/openapi";
import { logger } from "@/lib/logger";
import { createApiRouter } from "@/routes";

/**
 * Build the Express application from an explicit {@link AppContext} (db, auth
 * verifier, rate-limit store). Keeping dependencies injected makes the whole app
 * testable with PGlite + a fake verifier (P1 contract tests).
 *
 * Middleware order is significant: body parsing → routes → 404 → error handler.
 */
export function createApp(ctx: AppContext): Express {
  const app = express();
  app.disable("x-powered-by");
  app.set("trust proxy", true);
  app.use(webCors(ctx.webBaseUrl));
  app.use(express.json({ limit: "1mb" }));

  if (ctx.openApiValidation !== false) {
    const specPath = resolveSpecPath();
    if (specPath) {
      app.use(createOpenApiValidator(specPath));
    } else if (ctx.openApiValidation === true) {
      logger.warn("OpenAPI validation requested but docs/04 spec was not found");
    }
  }

  app.use(createApiRouter(ctx));

  // Must remain last.
  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
