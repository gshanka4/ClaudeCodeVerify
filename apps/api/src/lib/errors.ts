import type { ApiError as ApiErrorBody, VerificationGateConflict } from "@architectai/shared";

/**
 * Canonical API error codes. Keep this list small and stable — clients and the
 * audit log key off these. New domains should reuse an existing code where it
 * fits rather than inventing near-duplicates.
 */
export type ErrorCode =
  | "bad_request"
  | "unauthorized"
  | "forbidden"
  | "not_found"
  | "conflict"
  | "rate_limited"
  | "validation_error"
  | "internal_error";

const STATUS_BY_CODE: Record<ErrorCode, number> = {
  bad_request: 400,
  unauthorized: 401,
  forbidden: 403,
  not_found: 404,
  conflict: 409,
  rate_limited: 429,
  validation_error: 422,
  internal_error: 500,
};

/**
 * The single error type thrown across the API. The central error handler
 * (`middleware/error-handler.ts`) maps it to an HTTP status + the shared
 * `ApiError` body shape, so every error response looks identical.
 */
export type HttpErrorResponseBody =
  | ApiErrorBody
  | {
      error: {
        code: "verification_gate_failed";
        message: string;
        conflicts: VerificationGateConflict[];
      };
    };

export class ApiError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  readonly details?: Record<string, string[]>;

  constructor(code: ErrorCode, message: string, details?: Record<string, string[]>) {
    super(message);
    this.name = "ApiError";
    this.code = code;
    this.status = STATUS_BY_CODE[code];
    this.details = details;
  }

  toBody(): HttpErrorResponseBody {
    return { code: this.code, message: this.message, ...(this.details ? { details: this.details } : {}) };
  }

  static badRequest(message = "Bad request", details?: Record<string, string[]>): ApiError {
    return new ApiError("bad_request", message, details);
  }
  static unauthorized(message = "Authentication required"): ApiError {
    return new ApiError("unauthorized", message);
  }
  static forbidden(message = "Forbidden"): ApiError {
    return new ApiError("forbidden", message);
  }
  static notFound(message = "Resource not found"): ApiError {
    return new ApiError("not_found", message);
  }
  static conflict(message = "Conflict"): ApiError {
    return new ApiError("conflict", message);
  }
  static rateLimited(message = "Rate limit exceeded"): ApiError {
    return new ApiError("rate_limited", message);
  }
  static validation(message = "Validation failed", details?: Record<string, string[]>): ApiError {
    return new ApiError("validation_error", message, details);
  }
  static internal(message = "Internal server error"): ApiError {
    return new ApiError("internal_error", message);
  }
}

/** Lock gate failure — returns OpenAPI `VerificationGateFailedError` envelope. */
export class VerificationGateError extends ApiError {
  readonly conflicts: VerificationGateConflict[];

  constructor(conflicts: VerificationGateConflict[]) {
    super("conflict", "Verification gate failed: unresolved deterministic conflicts on critical components");
    this.conflicts = conflicts;
  }

  override toBody(): HttpErrorResponseBody {
    return {
      error: {
        code: "verification_gate_failed",
        message: this.message,
        conflicts: this.conflicts,
      },
    };
  }
}
