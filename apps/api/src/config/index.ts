import { type Env, loadEnv } from "@/env";

/**
 * Application configuration assembled from the validated environment. Code
 * should depend on `AppConfig` rather than reading `process.env` directly, so
 * configuration has a single, typed entry point that is easy to mock in tests.
 */
export interface AppConfig {
  env: Env;
  isProduction: boolean;
  isTest: boolean;
  verificationEnabled: boolean;
  tier2VerificationEnabled: boolean;
}

export function loadConfig(raw?: NodeJS.ProcessEnv): AppConfig {
  const env = loadEnv(raw);
  return {
    env,
    isProduction: env.APP_ENV === "production",
    isTest: env.APP_ENV === "test",
    verificationEnabled: env.VERIFICATION_ENABLED,
    tier2VerificationEnabled: env.VERIFICATION_TIER2_ENABLED && env.VERIFICATION_ENABLED,
  };
}
