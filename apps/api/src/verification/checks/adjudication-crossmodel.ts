import type { LlmGateway } from "@/ai/gateway";
import { VERIFICATION_ADJUDICATION_CROSSMODEL_PROMPT } from "@/ai/prompts/verification-adjudication";
import { crossModelAdjudicationResponseSchema } from "@/ai/schemas/verification-adjudication";
import type { ArchServiceDto } from "@/services/architectures.service";
import type { Tier1FindingDraft, VerificationContext } from "@/verification/types";

export const TIER2_ENGINE_VERSION = "tier2-crossmodel-v1.0.0";

function serviceSummary(service: ArchServiceDto): string {
  return [
    `name=${service.name}`,
    `layer=${service.layer ?? service.category}`,
    `tier=${service.confidenceTier}`,
    `description=${service.description}`,
    `rationale=${service.rationale}`,
  ].join("; ");
}

function constraintsSummary(ctx: VerificationContext): string {
  const reqCount = ctx.requirements.length;
  const ruleCount = ctx.rules.length;
  return `${reqCount} requirements, ${ruleCount} governance rules, ${ctx.services.length} services`;
}

function confidenceForOutcome(outcome: "agree" | "disagree" | "would_choose"): number {
  if (outcome === "agree") return 0.72;
  if (outcome === "disagree") return 0.68;
  return 0.65;
}

function detailForOutcome(
  service: ArchServiceDto,
  outcome: "agree" | "disagree" | "would_choose",
  rationale: string,
  alternativeChoice?: string,
): string {
  if (outcome === "agree") {
    return `Cross-model agrees with ${service.displayName ?? service.name} placement (advisory): ${rationale}`;
  }
  if (outcome === "disagree") {
    return `Cross-model disagrees with ${service.displayName ?? service.name} placement: ${rationale}`;
  }
  return `Cross-model would choose differently for ${service.displayName ?? service.name}: ${alternativeChoice ?? rationale}`;
}

export interface AdjudicateServiceOpts {
  timeoutMs?: number;
  maxAttempts?: number;
}

/** Run cross-model adjudication for one service — always probabilistic / never `verified`. */
export async function adjudicateServiceCrossModel(
  llm: LlmGateway,
  ctx: VerificationContext,
  service: ArchServiceDto,
  opts: AdjudicateServiceOpts = {},
): Promise<{ finding: Tier1FindingDraft; tokensUsed: number }> {
  const providerName = llm.getProviderName("verification-adjudication");
  const timeoutMs = opts.timeoutMs ?? 5_000;

  const call = llm.generateStructured(
    {
      workload: "verification-adjudication",
      promptId: VERIFICATION_ADJUDICATION_CROSSMODEL_PROMPT.id,
      schema: crossModelAdjudicationResponseSchema,
      variables: {
        serviceName: service.name,
        serviceSummary: serviceSummary(service),
        constraintsSummary: constraintsSummary(ctx),
      },
    },
    { maxAttempts: opts.maxAttempts ?? 2 },
  );

  let response: Awaited<typeof call>;
  try {
    response = await Promise.race([
      call,
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error("Cross-model adjudication timed out")), timeoutMs),
      ),
    ]);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Cross-model adjudication failed";
    return {
      finding: {
        architectureId: ctx.architectureId,
        serviceId: service.id,
        check: "adjudication.crossmodel",
        tier: "probabilistic",
        verdict: "unverified",
        confidence: 0.5,
        groundTruthSource: { kind: "cross-model", ref: `${providerName}:degraded` },
        detail: `Cross-model check degraded for ${service.name}: ${message}`,
      },
      tokensUsed: 0,
    };
  }

  const { outcome, rationale, alternativeChoice } = response.data;

  return {
    finding: {
      architectureId: ctx.architectureId,
      serviceId: service.id,
      check: "adjudication.crossmodel",
      tier: "probabilistic",
      verdict: "unverified",
      confidence: confidenceForOutcome(outcome),
      groundTruthSource: { kind: "cross-model", ref: `${providerName}:${outcome}` },
      detail: detailForOutcome(service, outcome, rationale, alternativeChoice),
      evidenceRef: outcome === "would_choose" ? alternativeChoice : undefined,
    },
    tokensUsed: response.usage.inputTokens + response.usage.outputTokens,
  };
}
