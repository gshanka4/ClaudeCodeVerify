import { TIER2_CROSSMODEL as TIER2_CONFIG } from "@architectai/config";
import type { LlmGateway } from "@/ai/gateway";
import { logger } from "@/lib/logger";
import {
  adjudicateServiceCrossModel,
  TIER2_ENGINE_VERSION,
} from "@/verification/checks/adjudication-crossmodel";
import type { Tier1FindingDraft, VerificationContext } from "@/verification/types";

export { TIER2_ENGINE_VERSION };

const TIER2_CROSSMODEL = TIER2_CONFIG ?? {
  batchSize: 5,
  tokenBudgetPerRun: 50_000,
  timeoutMs: 5_000,
  maxRetries: 2,
};

export interface Tier2RunOptions {
  batchSize?: number;
  tokenBudget?: number;
  timeoutMs?: number;
  maxRetries?: number;
}

export interface Tier2RunResult {
  findings: Tier1FindingDraft[];
  checksRun: number;
  checksSkipped: number;
  tokensUsed: number;
  timingMs: number;
}

/** Tier-2 probabilistic cross-model pass — batched, token-budgeted, never gates Lock. */
export async function runTier2(
  llm: LlmGateway,
  ctx: VerificationContext,
  opts: Tier2RunOptions = {},
): Promise<Tier2RunResult> {
  const started = performance.now();
  const batchSize = opts.batchSize ?? TIER2_CROSSMODEL.batchSize;
  const tokenBudget = opts.tokenBudget ?? TIER2_CROSSMODEL.tokenBudgetPerRun;
  const timeoutMs = opts.timeoutMs ?? TIER2_CROSSMODEL.timeoutMs;
  const maxRetries = opts.maxRetries ?? TIER2_CROSSMODEL.maxRetries;

  const findings: Tier1FindingDraft[] = [];
  let tokensUsed = 0;
  let checksSkipped = 0;

  const services = ctx.services;
  const total = services.length;

  for (let offset = 0; offset < total; offset += batchSize) {
    if (tokensUsed >= tokenBudget) {
      checksSkipped += total - offset;
      logger.warn(
        { architectureId: ctx.architectureId, tokensUsed, tokenBudget },
        "Tier-2 token budget exceeded — skipping remaining services",
      );
      break;
    }

    const batch = services.slice(offset, offset + batchSize);
    for (const service of batch) {
      if (tokensUsed >= tokenBudget) {
        checksSkipped += 1;
        continue;
      }
      try {
        const result = await adjudicateServiceCrossModel(llm, ctx, service, {
          timeoutMs,
          maxAttempts: maxRetries,
        });
        tokensUsed += result.tokensUsed;
        findings.push(result.finding);
      } catch (err) {
        logger.warn({ err, serviceId: service.id }, "Tier-2 service skipped after retries");
        checksSkipped += 1;
        findings.push({
          architectureId: ctx.architectureId,
          serviceId: service.id,
          check: "adjudication.crossmodel",
          tier: "probabilistic",
          verdict: "unverified",
          confidence: 0.5,
          groundTruthSource: {
            kind: "cross-model",
            ref: `${llm.getProviderName("verification-adjudication")}:skipped`,
          },
          detail: `Cross-model check skipped for ${service.name} after retry exhaustion`,
        });
      }
    }
  }

  return {
    findings,
    checksRun: findings.length,
    checksSkipped,
    tokensUsed,
    timingMs: performance.now() - started,
  };
}
