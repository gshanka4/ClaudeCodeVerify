import { verifyToken } from "@clerk/backend";
import type { TokenVerifier } from "@/middleware/auth";

/**
 * Production token verifier backed by Clerk. Verifies the session JWT signature
 * and returns the Clerk user id (`sub`). Networkless when `CLERK_JWT_KEY` is set.
 */
export function createClerkVerifier(opts: {
  secretKey: string;
  jwtKey?: string;
  authorizedParties?: string[];
}): TokenVerifier {
  return {
    async verify(token: string) {
      const payload = await verifyToken(token, {
        secretKey: opts.secretKey,
        clockSkewInMs: 60_000,
        ...(opts.jwtKey ? { jwtKey: opts.jwtKey } : {}),
        ...(opts.authorizedParties?.length ? { authorizedParties: opts.authorizedParties } : {}),
      });
      if (!payload.sub) throw new Error("Token missing subject");
      return { clerkUserId: payload.sub };
    },
  };
}
