import "@/env-bootstrap";
import { loadConfig } from "@/config";
import { createDb } from "@/db/client";
import { pgClient, runMigrations } from "@/db/migrate";
import { logger } from "@/lib/logger";

/** Forward-only migration CLI: `pnpm --filter @architectai/api migrate`. */
async function main(): Promise<void> {
  const config = loadConfig();
  const { pool } = createDb(config.env.DATABASE_URL);
  try {
    const applied = await runMigrations(pgClient(pool));
    logger.info({ applied }, applied.length > 0 ? "Migrations applied" : "No new migrations");
  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  logger.fatal({ err }, "Migration failed");
  process.exit(1);
});
