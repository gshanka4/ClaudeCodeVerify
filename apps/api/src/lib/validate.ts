import type { z, ZodTypeAny } from "zod";
import { ApiError } from "@/lib/errors";

/**
 * Parse untrusted input against a Zod schema, throwing a structured
 * `ApiError.validation` (422 + per-field `details`) on failure. Returns the
 * schema's OUTPUT type (so `.default()` fields are non-optional). Use for request
 * bodies / queries so error shapes are uniform across the API.
 */
export function parseOrThrow<S extends ZodTypeAny>(schema: S, data: unknown): z.output<S> {
  const result = schema.safeParse(data);
  if (result.success) return result.data;

  const details: Record<string, string[]> = {};
  for (const issue of result.error.issues) {
    const key = issue.path.join(".") || "_";
    (details[key] ??= []).push(issue.message);
  }
  throw ApiError.validation("Validation failed", details);
}
