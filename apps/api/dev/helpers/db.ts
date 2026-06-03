import type { UserRole } from "@architectai/shared";
import { PGlite } from "@electric-sql/pglite";
import { pg_trgm } from "@electric-sql/pglite/contrib/pg_trgm";
import { drizzle } from "drizzle-orm/pglite";
import type { AppDatabase } from "@/db/client";
import { runMigrations, type SqlClient } from "@/db/migrate";
import { schema } from "@/db/schema";

export interface DevDb {
  pg: PGlite;
  db: AppDatabase;
  close: () => Promise<void>;
}

/** In-process Postgres (PGlite) with real migrations — local dev only. */
export async function createDevDb(): Promise<DevDb> {
  const pg = new PGlite({ extensions: { pg_trgm } });
  const client: SqlClient = {
    exec: async (q) => {
      await pg.exec(q);
    },
    query: async <T>(text: string, params?: unknown[]) =>
      (await pg.query<T>(text, params ?? [])).rows,
  };
  await runMigrations(client);
  const db = drizzle(pg, { schema }) as unknown as AppDatabase;
  return { pg, db, close: () => pg.close() };
}

export interface ProvisionedUser {
  orgId: string;
  userId: string;
  role: UserRole;
  clerkId: string;
}

let seq = 0;

export async function provision(
  db: AppDatabase,
  opts: { name?: string; role?: UserRole } = {},
): Promise<ProvisionedUser> {
  seq += 1;
  const role = opts.role ?? "owner";
  const [org] = await db
    .insert(schema.organizations)
    .values({ name: opts.name ?? `Org ${seq}`, slug: `org-${seq}-${Date.now()}` })
    .returning();
  const [user] = await db
    .insert(schema.users)
    .values({
      clerkId: `clerk_${seq}_${Date.now()}`,
      organizationId: org!.id,
      email: `user${seq}@example.com`,
      displayName: `User ${seq}`,
      role,
    })
    .returning();
  return { orgId: org!.id, userId: user!.id, role, clerkId: user!.clerkId };
}
