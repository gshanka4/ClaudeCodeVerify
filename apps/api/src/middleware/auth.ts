import type { UserRole } from "@architectai/shared";
import { createClerkClient } from "@clerk/backend";
import { eq } from "drizzle-orm";
import type { RequestHandler } from "express";
import type { AppDatabase, TenantContext } from "@/db/client";
import { schema } from "@/db/schema";
import { ApiError } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { seedDefaultRuleset } from "@/services/governance.service";
import { provisionClerkUser } from "@/services/provision.service";

/** Identity + tenant context resolved for an authenticated request. */
export interface AuthContext extends TenantContext {
  clerkId: string;
  email: string;
}

export interface VerifiedToken {
  clerkUserId: string;
}

/**
 * Pluggable JWT verifier. Production uses Clerk; tests inject a fake. Keeping
 * this an interface means auth-dependent routes are testable without Clerk keys.
 */
export interface TokenVerifier {
  verify(token: string): Promise<VerifiedToken>;
}

const BEARER = /^Bearer\s+(.+)$/i;

function extractToken(header: string | undefined): string | null {
  if (!header) return null;
  const match = BEARER.exec(header);
  return match ? match[1]!.trim() : null;
}

/** Resolve the internal user/org/role from a Clerk user id (admin/RLS-bypass query). */
export async function resolveUserByClerkId(
  db: AppDatabase,
  clerkUserId: string,
): Promise<AuthContext | null> {
  const [user] = await db
    .select({
      userId: schema.users.id,
      organizationId: schema.users.organizationId,
      role: schema.users.role,
      email: schema.users.email,
      clerkId: schema.users.clerkId,
    })
    .from(schema.users)
    .where(eq(schema.users.clerkId, clerkUserId))
    .limit(1);
  if (!user) return null;
  return {
    userId: user.userId,
    organizationId: user.organizationId,
    role: user.role,
    email: user.email,
    clerkId: user.clerkId,
  };
}

async function resolveOrProvisionUser(
  db: AppDatabase,
  clerkUserId: string,
  clerkSecretKey?: string,
): Promise<AuthContext | null> {
  const existing = await resolveUserByClerkId(db, clerkUserId);
  if (existing) return existing;
  if (!clerkSecretKey?.trim()) return null;

  const clerk = createClerkClient({ secretKey: clerkSecretKey });
  const cu = await clerk.users.getUser(clerkUserId);
  const email =
    cu.emailAddresses.find((e) => e.id === cu.primaryEmailAddressId)?.emailAddress ??
    cu.emailAddresses[0]?.emailAddress ??
    `${clerkUserId}@users.clerk`;
  const displayName =
    [cu.firstName, cu.lastName].filter(Boolean).join(" ") ||
    cu.username ||
    email.split("@")[0] ||
    "User";

  const provisioned = await provisionClerkUser(db, {
    clerkId: clerkUserId,
    email,
    displayName,
  });
  await db.transaction(async (tx) => {
    await seedDefaultRuleset(tx, {
      organizationId: provisioned.organizationId,
      createdById: provisioned.userId,
    });
  });
  logger.info({ clerkUserId }, "Provisioned Clerk user on first API sign-in");
  return resolveUserByClerkId(db, clerkUserId);
}

/**
 * Auth-upfront gate: every `/api` route (except explicitly public ones) requires
 * a valid bearer token AND a provisioned user. Fail-closed on every branch.
 */
export function requireAuth(deps: {
  db: AppDatabase;
  verifier: TokenVerifier;
  clerkSecretKey?: string;
}): RequestHandler {
  return (req, _res, next) => {
    void (async () => {
      const token = extractToken(req.header("authorization"));
      if (!token) throw ApiError.unauthorized("Missing bearer token");

      let verified: VerifiedToken;
      try {
        verified = await deps.verifier.verify(token);
      } catch (err) {
        logger.warn({ err }, "Clerk token verification failed");
        throw ApiError.unauthorized("Invalid or expired token");
      }

      const user = await resolveOrProvisionUser(deps.db, verified.clerkUserId, deps.clerkSecretKey);
      if (!user) throw ApiError.unauthorized("User is not provisioned");

      req.auth = user;
    })()
      .then(() => next())
      .catch(next);
  };
}

/** RBAC guard. Use after `requireAuth`. Denies (403) when the role isn't allowed. */
export function requireRole(...roles: UserRole[]): RequestHandler {
  return (req, _res, next) => {
    if (!req.auth) return next(ApiError.unauthorized());
    if (!roles.includes(req.auth.role)) {
      return next(ApiError.forbidden(`Requires one of: ${roles.join(", ")}`));
    }
    next();
  };
}
