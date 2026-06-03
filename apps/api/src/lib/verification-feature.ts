/**
 * Verification feature flag (V6.x ship). Default on — set VERIFICATION_ENABLED=false
 * to restore v2.0 lock/export behavior without verification gates.
 */
export function isVerificationEnabled(raw: NodeJS.ProcessEnv = process.env): boolean {
  const v = raw.VERIFICATION_ENABLED?.trim().toLowerCase();
  if (!v || v === "") return true;
  return v !== "false" && v !== "0" && v !== "no";
}

/** Tier-2 cross-model can be disabled independently (V6x-EC-04 cost spike). */
export function isTier2VerificationEnabled(raw: NodeJS.ProcessEnv = process.env): boolean {
  if (!isVerificationEnabled(raw)) return false;
  const v = raw.VERIFICATION_TIER2_ENABLED?.trim().toLowerCase();
  if (!v || v === "") return true;
  return v !== "false" && v !== "0" && v !== "no";
}
