import type { Request, Response } from "express";
import { sql } from "drizzle-orm";
import type { AppContext } from "@/context";
import { getDb } from "@/db/client";
import { getVerificationMetricsSnapshot } from "@/lib/verification-metrics";
import { isVerificationEnabled, isTier2VerificationEnabled } from "@/lib/verification-feature";

/**
 * Liveness probe handler. Intentionally dependency-free (no DB/Redis) so it
 * reflects process liveness only.
 */
export function getHealth(_req: Request, res: Response): void {
  res.status(200).json({
    status: "ok",
    service: "architectai-api",
    time: new Date().toISOString(),
  });
}

async function checkDbReady(): Promise<{ ok: boolean; error?: string }> {
  try {
    await getDb().execute(sql`SELECT 1`);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "database unreachable" };
  }
}

async function checkRedisReady(redis: AppContext["redis"]): Promise<{
  ok: boolean;
  skipped?: boolean;
  error?: string;
}> {
  if (!redis) return { ok: true, skipped: true };
  try {
    const pong = await redis.ping();
    if (pong !== "PONG") return { ok: false, error: `unexpected ping: ${pong}` };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "redis unreachable" };
  }
}

/** Readiness: verification subsystem + DB + Redis (production deploy). */
export function createReadyzHandler(ctx: AppContext) {
  return async (_req: Request, res: Response): Promise<void> => {
    const verificationEnabled =
      ctx.verificationEnabled ?? isVerificationEnabled();
    const tier2Enabled = ctx.tier2VerificationEnabled ?? isTier2VerificationEnabled();

    const [db, redis] = await Promise.all([
      checkDbReady(),
      checkRedisReady(ctx.redis),
    ]);

    const ready = db.ok && redis.ok;
    res.status(ready ? 200 : 503).json({
      status: ready ? "ok" : "degraded",
      service: "architectai-api",
      time: new Date().toISOString(),
      dependencies: {
        database: db,
        redis,
      },
      verification: {
        enabled: verificationEnabled,
        tier2Enabled,
        streamBackend: ctx.verificationStreamBackend ?? "memory",
      },
      metrics: getVerificationMetricsSnapshot(),
    });
  };
}
