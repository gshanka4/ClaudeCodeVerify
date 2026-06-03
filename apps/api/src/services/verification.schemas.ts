import { VERIFICATION_CHECKS } from "@architectai/config";
import type { VerificationCheck, VerificationTier, VerificationVerdict } from "@architectai/shared";
import { z } from "zod";

export const groundTruthSourceSchema = z.object({
  kind: z.enum(["requirement", "rule", "capability-table", "reference-corpus", "cross-model"]),
  ref: z.string().min(1),
});

export const verificationFindingInputSchema = z.object({
  serviceId: z.string().uuid().optional(),
  lineageNodeId: z.string().uuid().optional(),
  check: z.enum(VERIFICATION_CHECKS as unknown as [VerificationCheck, ...VerificationCheck[]]),
  tier: z.enum(["deterministic", "probabilistic"] satisfies [VerificationTier, VerificationTier]),
  verdict: z.enum(["verified", "unverified", "conflict"] satisfies [
    VerificationVerdict,
    VerificationVerdict,
    VerificationVerdict,
  ]),
  confidence: z.number().min(0).max(1),
  groundTruthSource: groundTruthSourceSchema,
  detail: z.string().min(1),
  evidenceRef: z.string().optional(),
});

export type VerificationFindingInput = z.infer<typeof verificationFindingInputSchema>;

export const recordOverrideInputSchema = z.object({
  reason: z.string().min(10),
});
