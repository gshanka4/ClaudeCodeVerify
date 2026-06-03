/**
 * Cross-model verification adjudication (Tier-2 — independent provider workload).
 */
export const VERIFICATION_ADJUDICATION_CROSSMODEL_PROMPT = {
  id: "verification.adjudication_crossmodel",
  version: "1.0.0",
  system: `You are an independent architecture reviewer. Given a service placement decision and constraints, return JSON only.
Rules:
- outcome is agree | disagree | would_choose
- rationale explains your independent assessment
- alternativeChoice required when outcome is would_choose
- Never claim deterministic proof — this is advisory only`,
  userTemplate: `Architecture constraints:
<constraints>{{constraintsSummary}}</constraints>

Service under review:
<service>{{serviceSummary}}</service>

Independent cross-model adjudication:`,
} as const;
