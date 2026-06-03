#!/usr/bin/env tsx
/**
 * Production env dry-run (no network). Used by `pnpm validate:prod-env`.
 * Loads repo `.env.production` when present (keys already in process.env win).
 */
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { loadEnv } from "@/env";

function loadDotEnvProduction(): Record<string, string> {
  const filePath = resolve(process.cwd(), "../../.env.production");
  const alt = resolve(process.cwd(), ".env.production");
  const path = existsSync(filePath) ? filePath : existsSync(alt) ? alt : null;
  if (!path) return {};
  const out: Record<string, string> = {};
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

function main(): void {
  const fromFile = loadDotEnvProduction();
  const raw = { ...fromFile, ...process.env, APP_ENV: process.env.APP_ENV ?? fromFile.APP_ENV ?? "production" };
  const env = loadEnv(raw);

  if (env.APP_ENV !== "production") {
    console.error("PR-ENV-01: Set APP_ENV=production for this check");
    process.exit(1);
  }

  const required = [
    "DATABASE_URL",
    "REDIS_URL",
    "CLERK_SECRET_KEY",
    "PUBLIC_API_URL",
    "PUBLIC_WS_URL",
    "WEB_BASE_URL",
    "ANTHROPIC_API_KEY",
    "LLM_MODEL_INTERROGATION",
    "LLM_MODEL_GENERATION",
    "LLM_MODEL_ASSIST",
  ] as const;
  const populated = required.filter((k) => Boolean(raw[k]?.trim()));

  console.log("Production environment schema: OK");
  console.log(
    JSON.stringify(
      {
        APP_ENV: env.APP_ENV,
        LLM_PROVIDER: env.LLM_PROVIDER,
        VERIFICATION_ENABLED: env.VERIFICATION_ENABLED,
        PUBLIC_API_URL: env.PUBLIC_API_URL,
        WEB_BASE_URL: env.WEB_BASE_URL,
        RUN_MIGRATIONS_ON_BOOT: env.RUN_MIGRATIONS_ON_BOOT ?? true,
        requiredVarsPopulated: `${populated.length}/${required.length}`,
      },
      null,
      2,
    ),
  );
  if (populated.length < required.length) {
    const missing = required.filter((k) => !raw[k]?.trim());
    console.error("Missing or empty:", missing.join(", "));
    process.exit(1);
  }
}

main();
