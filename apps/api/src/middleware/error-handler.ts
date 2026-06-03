import type { ApiError as ApiErrorBody } from "@architectai/shared";
import type { ErrorRequestHandler, RequestHandler } from "express";
import { ApiError } from "@/lib/errors";
import { logger } from "@/lib/logger";

/**
 * Terminal 404 handler — funnels unmatched routes through the same error shape
 * as everything else by forwarding an `ApiError` to the error handler.
 */
export const notFoundHandler: RequestHandler = (req, _res, next) => {
  next(ApiError.notFound(`Route not found: ${req.method} ${req.path}`));
};

/**
 * Central error handler. Maps `ApiError` to its status + the shared `ApiError`
 * body; treats anything else as an unexpected 500 (logged with the stack, but
 * never leaking internals to the client).
 *
 * MUST be registered last, after all routes and the 404 handler.
 */
/** Shape of an express-openapi-validator error (request/response contract violation). */
interface OpenApiValidationError {
  status: number;
  errors: { path: string; message: string; errorCode?: string }[];
}

function isOpenApiError(err: unknown): err is OpenApiValidationError {
  return (
    typeof err === "object" &&
    err !== null &&
    typeof (err as { status?: unknown }).status === "number" &&
    Array.isArray((err as { errors?: unknown }).errors)
  );
}

export const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  if (err instanceof ApiError) {
    if (err.status >= 500) {
      logger.error({ err, code: err.code }, err.message);
    }
    res.status(err.status).json(err.toBody());
    return;
  }

  // Map OpenAPI contract violations to our uniform envelope (422 with field details).
  if (isOpenApiError(err)) {
    const details: Record<string, string[]> = {};
    for (const issue of err.errors) {
      // openapi-validator paths look like "/body/name" or "body.name" — key on the leaf.
      const key =
        issue.path
          ?.split(/[./]/)
          .filter(Boolean)
          .filter((s) => s !== "body" && s !== "query" && s !== "params")
          .pop() ?? "_";
      (details[key] ??= []).push(issue.message);
    }
    const mapped =
      err.status === 401
        ? ApiError.unauthorized()
        : err.status === 404
          ? ApiError.notFound()
          : ApiError.validation("Request does not match API contract", details);
    res.status(mapped.status).json(mapped.toBody());
    return;
  }

  logger.error({ err }, "Unhandled error");
  const body: ApiErrorBody = { code: "internal_error", message: "Internal server error" };
  res.status(500).json(body);
};
