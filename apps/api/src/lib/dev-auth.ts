import type { TokenVerifier } from "@/middleware/auth";

/**
 * Local/test verifier: bearer token === Clerk user id. Matches Playwright E2E and
 * dev sign-in when Clerk keys are absent (README dev auth).
 */
export const devTokenVerifier: TokenVerifier = {
  verify: async (token: string) => ({ clerkUserId: token }),
};
