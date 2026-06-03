import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import * as OpenApiValidator from "express-openapi-validator";
import type { RequestHandler } from "express";

/**
 * Locate `docs/04_ARCHITECTAI_API_SPEC.yaml` (the API contract). Resolves relative
 * to this source file in dev/test; returns null if not found (e.g. a prod bundle
 * without docs), so contract validation degrades gracefully rather than crashing.
 */
export function resolveSpecPath(): string | null {
  const here = dirname(fileURLToPath(import.meta.url));
  const candidates = [
    resolve(here, "../../../../docs/04_ARCHITECTAI_API_SPEC.yaml"),
    resolve(process.cwd(), "../../docs/04_ARCHITECTAI_API_SPEC.yaml"),
    resolve(process.cwd(), "docs/04_ARCHITECTAI_API_SPEC.yaml"),
  ];
  return candidates.find((p) => existsSync(p)) ?? null;
}

/**
 * express-openapi-validator middlewares that validate requests against docs/04.
 * Security is handled by our own `requireAuth`; responses aren't validated in prod
 * (avoids coupling hot paths to spec drift). Contract violations are surfaced via
 * the central error handler as 422 `validation_error`.
 */
export function createOpenApiValidator(specPath: string): RequestHandler[] {
  return OpenApiValidator.middleware({
    apiSpec: specPath,
    validateRequests: true,
    validateResponses: false,
    validateSecurity: false,
    ignoreUndocumented: true,
  }) as unknown as RequestHandler[];
}
