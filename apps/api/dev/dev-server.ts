/**
 * Local dev API — PGlite + in-memory hubs (no Docker).
 * Start: `pnpm --filter @architectai/api dev:staging` (loads repo `.env.local` for LLM keys)
 */
import "@/env-bootstrap";
import express from "express";
import { createApp } from "@/app";
import { createLlmGateway } from "@/ai/gateway";
import { logger } from "@/lib/logger";
import type { AppContext } from "@/context";
import { InMemoryDriftHub } from "@/drift/drift-hub";
import { InMemoryGenerationStreamHub } from "@/generation/stream-hub";
import { devTokenVerifier } from "@/lib/dev-auth";
import { InMemoryVerificationStreamHub } from "@/verification/stream-hub";
import { createDriftEngineState } from "@/services/drift.service";
import { seedDefaultRuleset } from "@/services/governance.service";
import { provisionDevUser } from "@/services/provision.service";
import { createDevDb } from "./helpers/db";
import { InMemoryRateLimitStore } from "@/middleware/rate-limit";

const PORT = Number(process.env.DEV_API_PORT ?? process.env.PORT ?? 4000);

async function main(): Promise<void> {
  const devDb = await createDevDb();
  const llm = createLlmGateway({
    LLM_PROVIDER: (process.env.LLM_PROVIDER as "mock" | "anthropic" | "openai" | "oss" | undefined) ?? "mock",
    ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
    LLM_MODEL_INTERROGATION: process.env.LLM_MODEL_INTERROGATION,
    LLM_MODEL_GENERATION: process.env.LLM_MODEL_GENERATION,
    LLM_MODEL_ASSIST: process.env.LLM_MODEL_ASSIST,
    LLM_SESSION_MAX_OUTPUT_TOKENS: process.env.LLM_SESSION_MAX_OUTPUT_TOKENS
      ? Number(process.env.LLM_SESSION_MAX_OUTPUT_TOKENS)
      : undefined,
  });
  const ctx: AppContext = {
    db: devDb.db,
    verifier: devTokenVerifier,
    rateLimitStore: new InMemoryRateLimitStore(),
    llm,
    genHub: new InMemoryGenerationStreamHub(),
    verifyHub: new InMemoryVerificationStreamHub(),
    driftHub: new InMemoryDriftHub(),
    driftEngine: createDriftEngineState(),
    openApiValidation: false,
  };
  logger.info(
    {
      envProvider: process.env.LLM_PROVIDER ?? "unset",
      interrogationProvider: ctx.llm.getProviderName("interrogation"),
      generationProvider: ctx.llm.getProviderName("generation"),
      verificationProvider: ctx.llm.getProviderName("verification-adjudication"),
    },
    "dev-server llm providers",
  );

  const root = express();
  root.disable("x-powered-by");
  root.use(express.json());

  const provisionHandler = async (_req: express.Request, res: express.Response) => {
    const user = await provisionDevUser(devDb.db, { role: "owner" });
    await devDb.db.transaction(async (tx) => {
      await seedDefaultRuleset(tx, {
        organizationId: user.organizationId,
        createdById: user.userId,
      });
    });
    res.json({ clerkId: user.clerkId, organizationId: user.organizationId });
  };

  root.post("/__dev__/provision", (req, res, next) => {
    void provisionHandler(req, res).catch(next);
  });
  root.post("/__e2e__/provision", (req, res, next) => {
    void provisionHandler(req, res).catch(next);
  });

  root.get("/__dev__/llm-metering", (_req, res) => {
    res.json({
      usage: ctx.llm.getMetering(),
      usageByModel: ctx.llm.getMeteringByModel(),
    });
  });

  root.get("/__dev__/llm-providers", (_req, res) => {
    res.json({
      interrogation: ctx.llm.getProviderName("interrogation"),
      generation: ctx.llm.getProviderName("generation"),
      verificationAdjudication: ctx.llm.getProviderName("verification-adjudication"),
    });
  });

  root.post("/__dev__/llm-metering/reset", (_req, res) => {
    ctx.llm.resetMetering();
    res.json({ ok: true });
  });

  root.use(createApp(ctx));

  root.listen(PORT, () => {
    process.stdout.write(
      `[dev-server] http://localhost:${PORT} (PGlite, dev auth — no Docker)\n`,
    );
  });

  const shutdown = async () => {
    await devDb.close();
    process.exit(0);
  };
  process.on("SIGINT", () => void shutdown());
  process.on("SIGTERM", () => void shutdown());
}

void main();
