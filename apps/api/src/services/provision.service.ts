import type { UserRole } from "@architectai/shared";
import type { AppDatabase } from "@/db/client";
import { schema } from "@/db/schema";

export interface ProvisionedUser {
  organizationId: string;
  userId: string;
  role: UserRole;
  /** Clerk subject id — dev verifier treats bearer token as this value. */
  clerkId: string;
}

let devSeq = 0;

/**
 * Provision an organization + user (mimics Clerk webhook). Uses the admin DB path
 * (no tenant context) — same as test helpers and local `POST /__dev__/provision`.
 */
export async function provisionDevUser(
  db: AppDatabase,
  opts: { name?: string; role?: UserRole } = {},
): Promise<ProvisionedUser> {
  devSeq += 1;
  const role = opts.role ?? "owner";
  const clerkId = `clerk_dev_${devSeq}_${Date.now()}`;
  const [org] = await db
    .insert(schema.organizations)
    .values({ name: opts.name ?? `Dev Org ${devSeq}`, slug: `dev-org-${devSeq}-${Date.now()}` })
    .returning();
  const [user] = await db
    .insert(schema.users)
    .values({
      clerkId,
      organizationId: org!.id,
      email: `dev${devSeq}@example.local`,
      displayName: `Dev User ${devSeq}`,
      role,
    })
    .returning();
  return { organizationId: org!.id, userId: user!.id, role, clerkId };
}

/** First sign-in from Clerk — creates org + user (demo deploy; no webhook required). */
export async function provisionClerkUser(
  db: AppDatabase,
  input: { clerkId: string; email: string; displayName: string; role?: UserRole },
): Promise<ProvisionedUser> {
  const role = input.role ?? "owner";
  const slugSuffix = input.clerkId.replace(/[^a-zA-Z0-9]/g, "").slice(-12) || "user";
  const [org] = await db
    .insert(schema.organizations)
    .values({
      name: `${input.displayName}'s workspace`,
      slug: `org-${slugSuffix}-${Date.now()}`,
    })
    .returning();
  const [user] = await db
    .insert(schema.users)
    .values({
      clerkId: input.clerkId,
      organizationId: org!.id,
      email: input.email,
      displayName: input.displayName,
      role,
    })
    .returning();
  return {
    organizationId: org!.id,
    userId: user!.id,
    role,
    clerkId: user!.clerkId,
  };
}
