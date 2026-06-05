import type IORedis from "ioredis";
import type { LlmGateway } from "@/ai/gateway";
import type { AppDatabase } from "@/db/client";
import type { InMemoryDriftHub } from "@/drift/drift-hub";
import type { GenerationStreamHub } from "@/generation/stream-hub";
import type { VerificationStreamHub } from "@/verification/stream-hub";
import type { DriftEngineState } from "@/services/drift.service";
import type { TokenVerifier } from "@/middleware/auth";
import type { RateLimitStore } from "@/middleware/rate-limit";

/**
 * Everything the route/controller layer needs, injected at boot. Passing this
 * explicitly (rather than reaching for globals) keeps the app construct-and-test
 * friendly: tests build an `AppContext` backed by PGlite + a fake verifier.
 */
export interface AppContext {
  db: AppDatabase;
  verifier: TokenVerifier;
  rateLimitStore: RateLimitStore;
  llm: LlmGateway;
  genHub: GenerationStreamHub;
  verifyHub: VerificationStreamHub;
  driftHub: InMemoryDriftHub;
  driftEngine: DriftEngineState;
  /** Enable express-openapi-validator request validation against docs/04. Default: on when the spec is found. */
  openApiValidation?: boolean;
  /** V6.x — when false, lock/export skip verification gates (v2 behavior). */
  verificationEnabled?: boolean;
  tier2VerificationEnabled?: boolean;
  /** In-memory vs Redis verification SSE hub (for health/readiness). */
  verificationStreamBackend?: "memory" | "redis";
  /** Optional Redis client for `/readyz` dependency checks. */
  redis?: IORedis | null;
  /** Production web origin for CORS (from WEB_BASE_URL). */
  webBaseUrl?: string;
  /** Clerk secret for first-sign-in user provisioning. */
  clerkSecretKey?: string;
}
