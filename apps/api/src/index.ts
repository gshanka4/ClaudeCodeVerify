import "@/env-bootstrap";
import express from "express";
import IORedis from "ioredis";
import { createApp } from "@/app";
import { loadConfig } from "@/config";
import type { AppContext } from "@/context";
import { createLlmGateway } from "@/ai/gateway";
import { getDbPool, initDb } from "@/db/client";
import { pgClient, runMigrations } from "@/db/migrate";
import { EnvValidationError } from "@/env";
import { createClerkVerifier } from "@/lib/clerk";
import { devTokenVerifier } from "@/lib/dev-auth";
import { logger } from "@/lib/logger";
import { seedDefaultRuleset } from "@/services/governance.service";
import { provisionDevUser } from "@/services/provision.service";
import {
  InMemoryGenerationStreamHub,
  RedisGenerationStreamHub,
} from "@/generation/stream-hub";
import {
  InMemoryVerificationStreamHub,
  RedisVerificationStreamHub,
} from "@/verification/stream-hub";
import { InMemoryDriftHub } from "@/drift/drift-hub";
import {
  InMemoryRateLimitStore,
  RedisRateLimitStore,
  type RateLimitStore,
} from "@/middleware/rate-limit";
import { createDriftEngineState } from "@/services/drift.service";

function shouldRunMigrationsOnBoot(
  explicit: boolean | null,
  isProduction: boolean,
): boolean {
  if (explicit === true) return true;
  if (explicit === false) return false;
  return isProduction;
}

async function main(): Promise<void> {
  let config;
  try {
    config = loadConfig();
  } catch (err) {
    if (err instanceof EnvValidationError) {
      logger.fatal({ missing: err.missing }, err.message);
      process.exit(1);
    }
    throw err;
  }

  const { db } = initDb(config.env.DATABASE_URL);

  if (shouldRunMigrationsOnBoot(config.env.RUN_MIGRATIONS_ON_BOOT, config.isProduction)) {
    const applied = await runMigrations(pgClient(getDbPool()));
    logger.info({ applied }, applied.length > 0 ? "Migrations applied at boot" : "Schema up to date");
  }

  const useDevAuth =
    config.env.APP_ENV === "local" && !config.env.CLERK_SECRET_KEY?.trim();
  const verifier = useDevAuth
    ? devTokenVerifier
    : createClerkVerifier({
        secretKey: config.env.CLERK_SECRET_KEY ?? "",
        jwtKey: config.env.CLERK_JWT_KEY,
      });
  if (useDevAuth) {
    logger.warn(
      "CLERK_SECRET_KEY not set — using dev bearer-as-clerkId auth (local only). Do not use in production.",
    );
  }

  let redis: IORedis | null = null;
  let rateLimitStore: RateLimitStore;
  let genHub: import("@/generation/stream-hub").GenerationStreamHub =
    new InMemoryGenerationStreamHub();
  let verifyHub: import("@/verification/stream-hub").VerificationStreamHub =
    new InMemoryVerificationStreamHub();
  let verificationStreamBackend: "memory" | "redis" = "memory";
  try {
    redis = new IORedis(config.env.REDIS_URL, { maxRetriesPerRequest: 2 });
    await redis.connect();
    rateLimitStore = new RedisRateLimitStore(redis);
    genHub = new RedisGenerationStreamHub(redis);
    verifyHub = new RedisVerificationStreamHub(redis);
    verificationStreamBackend = "redis";
  } catch (err) {
    logger.warn({ err }, "Redis unavailable — falling back to in-memory rate limit and SSE hubs");
    rateLimitStore = new InMemoryRateLimitStore();
  }

  const llm = createLlmGateway({
    LLM_PROVIDER: config.env.LLM_PROVIDER,
    ANTHROPIC_API_KEY: config.env.ANTHROPIC_API_KEY,
    LLM_MODEL_INTERROGATION: config.env.LLM_MODEL_INTERROGATION,
    LLM_MODEL_GENERATION: config.env.LLM_MODEL_GENERATION,
    LLM_MODEL_ASSIST: config.env.LLM_MODEL_ASSIST,
    LLM_SESSION_MAX_OUTPUT_TOKENS: config.env.LLM_SESSION_MAX_OUTPUT_TOKENS,
  });
  const ctx: AppContext = {
    db,
    verifier,
    rateLimitStore,
    llm,
    genHub,
    verifyHub,
    driftHub: new InMemoryDriftHub(),
    driftEngine: createDriftEngineState(),
    verificationEnabled: config.verificationEnabled,
    tier2VerificationEnabled: config.tier2VerificationEnabled,
    verificationStreamBackend,
    redis,
    webBaseUrl: config.env.WEB_BASE_URL,
  };
  const root = express();
  root.disable("x-powered-by");
  root.set("trust proxy", true);

  if (config.env.APP_ENV === "local") {
    root.post("/__dev__/provision", async (_req, res, next) => {
      try {
        const user = await provisionDevUser(db, { role: "owner" });
        await db.transaction(async (tx) => {
          await seedDefaultRuleset(tx, {
            organizationId: user.organizationId,
            createdById: user.userId,
          });
        });
        res.json({ clerkId: user.clerkId, organizationId: user.organizationId });
      } catch (err) {
        next(err);
      }
    });

    root.get("/__dev__/llm-metering", (_req, res) => {
      res.json({
        usage: ctx.llm.getMetering(),
        usageByModel: ctx.llm.getMeteringByModel(),
      });
    });

    root.post("/__dev__/llm-metering/reset", (_req, res) => {
      ctx.llm.resetMetering();
      res.json({ ok: true });
    });
  }

  root.use(createApp(ctx));

  root.listen(config.env.PORT, () => {
    logger.info(
      {
        port: config.env.PORT,
        env: config.env.APP_ENV,
        llmProvider: config.env.LLM_PROVIDER,
        verificationStreamBackend,
      },
      "ArchitectAI API listening",
    );
  });
}

void main().catch((err) => {
  logger.fatal({ err }, "API boot failed");
  process.exit(1);
});
