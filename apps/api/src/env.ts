import { z } from "zod";

/**
 * Environment schema. Boot fails closed (P0-EC-02) with a named list of the
 * missing/invalid variables — never a raw stack trace. Infra-required vars
 * (DATABASE_URL, REDIS_URL) are mandatory so we surface misconfiguration early,
 * per `new_architecture.md §12.4`.
 *
 * NOTE: the HTTP app (`createApp`) does NOT depend on env, so `/healthz` and
 * unit tests work without a full environment.
 */
export const envSchema = z.object({
  APP_ENV: z.enum(["local", "production", "test"]).default("local"),
  PORT: z.coerce.number().int().positive().max(65535).default(4000),
  LOG_LEVEL: z
    .enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"])
    .default("info"),
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  REDIS_URL: z.string().min(1, "REDIS_URL is required"),
  // Clerk (auth). Required in production; the boot path enforces that explicitly
  // so local/test can run without external accounts.
  CLERK_SECRET_KEY: z.string().optional(),
  CLERK_JWT_KEY: z.string().optional(),
  /** V6.x — verification gates (default on). Set false to restore v2 lock/export behavior. */
  VERIFICATION_ENABLED: z
    .string()
    .optional()
    .transform((v) => {
      const normalized = v?.trim().toLowerCase();
      if (!normalized || normalized === "") return true;
      return normalized !== "false" && normalized !== "0" && normalized !== "no";
    }),
  /** When false, Tier-2 cross-model is skipped (Tier-1 + Lock still run). */
  VERIFICATION_TIER2_ENABLED: z
    .string()
    .optional()
    .transform((v) => {
      const normalized = v?.trim().toLowerCase();
      if (!normalized || normalized === "") return true;
      return normalized !== "false" && normalized !== "0" && normalized !== "no";
    }),
  /**
   * L0/L1 provider toggle. Defaults to mock so CI/tests stay deterministic
   * until real adapters are explicitly enabled.
   */
  LLM_PROVIDER: z.enum(["mock", "anthropic", "openai", "oss"]).default("mock"),
  ANTHROPIC_API_KEY: z.string().optional(),
  OPENAI_API_KEY: z.string().optional(),
  OSS_LLM_BASE_URL: z.string().url().optional(),
  OSS_LLM_API_KEY: z.string().optional(),
  LLM_MODEL_INTERROGATION: z.string().optional(),
  LLM_MODEL_GENERATION: z.string().optional(),
  LLM_MODEL_ASSIST: z.string().optional(),
  /** Optional per-process output token cap (L0 budget guardrail). */
  LLM_SESSION_MAX_OUTPUT_TOKENS: z.coerce.number().int().positive().optional(),
  /** Public API base URL (Claude Code bundles, cursor config, MCP). */
  PUBLIC_API_URL: z.string().url().optional(),
  PUBLIC_WS_URL: z.string().optional(),
  /** Web app origin for CORS (required in production when web and API are on different hosts). */
  WEB_BASE_URL: z.string().url().optional(),
  /** Run SQL migrations before listening (default: true when APP_ENV=production). */
  RUN_MIGRATIONS_ON_BOOT: z
    .string()
    .optional()
    .transform((v) => {
      const normalized = v?.trim().toLowerCase();
      if (normalized === "false" || normalized === "0" || normalized === "no") return false;
      if (normalized === "true" || normalized === "1" || normalized === "yes") return true;
      return null;
    }),
}).superRefine((env, ctx) => {
  if (env.APP_ENV === "production") {
    if (!env.CLERK_SECRET_KEY?.trim()) {
      ctx.addIssue({
        path: ["CLERK_SECRET_KEY"],
        code: z.ZodIssueCode.custom,
        message: "CLERK_SECRET_KEY is required when APP_ENV=production",
      });
    }
    if (!env.PUBLIC_API_URL?.trim()) {
      ctx.addIssue({
        path: ["PUBLIC_API_URL"],
        code: z.ZodIssueCode.custom,
        message: "PUBLIC_API_URL is required when APP_ENV=production (export + IDE handoff)",
      });
    }
    if (!env.WEB_BASE_URL?.trim()) {
      ctx.addIssue({
        path: ["WEB_BASE_URL"],
        code: z.ZodIssueCode.custom,
        message: "WEB_BASE_URL is required when APP_ENV=production (CORS for the web app)",
      });
    }
    if (env.LLM_PROVIDER === "mock") {
      ctx.addIssue({
        path: ["LLM_PROVIDER"],
        code: z.ZodIssueCode.custom,
        message: "LLM_PROVIDER=mock is not allowed when APP_ENV=production",
      });
    }
  }

  if (env.LLM_PROVIDER !== "anthropic") return;

  const key = env.ANTHROPIC_API_KEY?.trim();
  if (!key) {
    ctx.addIssue({
      path: ["ANTHROPIC_API_KEY"],
      code: z.ZodIssueCode.custom,
      message: "ANTHROPIC_API_KEY is required when LLM_PROVIDER=anthropic",
    });
  } else if (!key.startsWith("sk-ant-")) {
    ctx.addIssue({
      path: ["ANTHROPIC_API_KEY"],
      code: z.ZodIssueCode.custom,
      message: "ANTHROPIC_API_KEY must look like an Anthropic key (sk-ant-...)",
    });
  }

  for (const modelKey of [
    "LLM_MODEL_INTERROGATION",
    "LLM_MODEL_GENERATION",
    "LLM_MODEL_ASSIST",
  ] as const) {
    if (!env[modelKey]?.trim()) {
      ctx.addIssue({
        path: [modelKey],
        code: z.ZodIssueCode.custom,
        message: `${modelKey} is required when LLM_PROVIDER=anthropic`,
      });
    }
  }
});

export type Env = z.infer<typeof envSchema>;

/** Thrown when environment validation fails. Carries the offending var names. */
export class EnvValidationError extends Error {
  constructor(
    public readonly missing: string[],
    message: string,
  ) {
    super(message);
    this.name = "EnvValidationError";
  }
}

/**
 * Parse + validate the environment. Throws {@link EnvValidationError} listing
 * each invalid var by name.
 */
export function loadEnv(raw: NodeJS.ProcessEnv = process.env): Env {
  const parsed = envSchema.safeParse(raw);
  if (parsed.success) {
    return parsed.data;
  }

  const names = parsed.error.issues.map((issue) => issue.path.join("."));
  const detail = parsed.error.issues
    .map((issue) => `  - ${issue.path.join(".") || "(root)"}: ${issue.message}`)
    .join("\n");
  throw new EnvValidationError(
    names,
    `Invalid environment configuration:\n${detail}`,
  );
}
