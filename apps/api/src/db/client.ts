import type { UserRole } from "@architectai/shared";
import { sql } from "drizzle-orm";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import pg from "pg";
import { schema } from "@/db/schema";

export type AppDatabase = NodePgDatabase<typeof schema>;
/** A transaction handle as passed to the `withTenant` callback. */
export type AppTx = Parameters<Parameters<AppDatabase["transaction"]>[0]>[0];

/** Per-request tenant identity, set as Postgres session vars for RLS. */
export interface TenantContext {
  organizationId: string;
  userId: string;
  role: UserRole;
}

export interface DbHandle {
  db: AppDatabase;
  pool: pg.Pool;
}

export function createDb(connectionString: string): DbHandle {
  const pool = new pg.Pool({ connectionString, max: 10 });
  const db = drizzle(pool, { schema });
  return { db, pool };
}

/**
 * Run `cb` inside a transaction scoped to a tenant. Downgrades to the non-owner
 * `app_user` role and sets `app.current_organization_id` / `app.current_user_id`
 * so RLS policies enforce isolation. Use this for ALL request-driven data access.
 *
 * Provisioning/migrations/seeding that must precede tenant context should use the
 * raw `db` (owner role bypasses RLS).
 */
export async function withTenant<T>(
  db: AppDatabase,
  ctx: TenantContext,
  cb: (tx: AppTx) => Promise<T>,
): Promise<T> {
  return db.transaction(async (tx) => {
    // Role name is a constant — safe to inline. Context values are parameterized.
    await tx.execute(sql`SET LOCAL ROLE app_user`);
    await tx.execute(sql`SELECT set_config('app.current_organization_id', ${ctx.organizationId}, true)`);
    await tx.execute(sql`SELECT set_config('app.current_user_id', ${ctx.userId}, true)`);
    return cb(tx);
  });
}

// ─── Module singleton (initialized at boot) ───────────────────────────────────
let handle: DbHandle | null = null;

export function initDb(connectionString: string): DbHandle {
  handle = createDb(connectionString);
  return handle;
}

export function getDb(): AppDatabase {
  if (!handle) throw new Error("Database not initialized — call initDb() at boot");
  return handle.db;
}

export function getDbPool(): pg.Pool {
  if (!handle) throw new Error("Database not initialized — call initDb() at boot");
  return handle.pool;
}

export async function closeDb(): Promise<void> {
  if (handle) {
    await handle.pool.end();
    handle = null;
  }
}
