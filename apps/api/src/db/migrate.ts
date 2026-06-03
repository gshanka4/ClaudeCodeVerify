import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Minimal forward-only migration runner. Applies `*.sql` files in lexical order
 * exactly once, tracked in a `_migrations` table. Each file is applied atomically
 * (BEGIN/COMMIT) so a partial failure never marks a migration as applied
 * (P1-EC-04: idempotent, forward-only).
 *
 * Driver-agnostic via the `SqlClient` adapter, so the same migrations run on
 * node-postgres (prod) and PGlite (tests).
 */
export interface SqlClient {
  /** Run a multi-statement SQL script (DDL). */
  exec(query: string): Promise<void>;
  /** Run a single parameterized query and return rows. */
  query<T = Record<string, unknown>>(text: string, params?: unknown[]): Promise<T[]>;
}

export const MIGRATIONS_DIR = join(dirname(fileURLToPath(import.meta.url)), "migrations");

export async function runMigrations(
  client: SqlClient,
  dir: string = MIGRATIONS_DIR,
): Promise<string[]> {
  await client.exec(
    `CREATE TABLE IF NOT EXISTS _migrations (name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())`,
  );

  const files = readdirSync(dir)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  const applied: string[] = [];
  for (const file of files) {
    const rows = await client.query<{ name: string }>(`SELECT name FROM _migrations WHERE name = $1`, [
      file,
    ]);
    if (rows.length > 0) continue;

    const sqlText = readFileSync(join(dir, file), "utf8");
    const safeName = file.replace(/'/g, "''");
    await client.exec(
      `BEGIN;\n${sqlText}\nINSERT INTO _migrations(name) VALUES ('${safeName}');\nCOMMIT;`,
    );
    applied.push(file);
  }
  return applied;
}

/** Adapt a node-postgres Pool to the `SqlClient` interface. */
export function pgClient(pool: {
  query: (text: string, params?: unknown[]) => Promise<{ rows: unknown[] }>;
}): SqlClient {
  return {
    exec: async (query) => {
      await pool.query(query);
    },
    query: async <T>(text: string, params?: unknown[]) =>
      (await pool.query(text, params)).rows as T[],
  };
}
