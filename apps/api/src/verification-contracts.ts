/**
 * V0 contract surface — ensures @architectai/shared verification types import cleanly in api.
 */
import type {
  VerificationRun,
  VerificationStreamEvent,
  TrustGradeBreakdown,
} from "@architectai/shared";

export type ApiVerificationRun = VerificationRun;
export type ApiVerificationStreamEvent = VerificationStreamEvent;
export type ApiTrustGradeBreakdown = TrustGradeBreakdown;
