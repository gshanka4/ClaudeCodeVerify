/**
 * V0 contract surface — ensures @architectai/shared verification types import cleanly in web.
 */
import type {
  VerificationRun,
  VerificationVerdict,
  ComponentVerdictRollup,
} from "@architectai/shared";

export type WebVerificationRun = VerificationRun;
export type WebVerificationVerdict = VerificationVerdict;
export type WebComponentVerdictRollup = ComponentVerdictRollup;
