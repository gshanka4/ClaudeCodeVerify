import type { z } from "zod";
import {
  crossModelAdjudicationResponseSchema,
  type CrossModelAdjudicationResponse,
} from "@/ai/schemas/verification-adjudication";
import { VERIFICATION_ADJUDICATION_CROSSMODEL_PROMPT } from "@/ai/prompts/verification-adjudication";
import type { GenerateStructuredParams, LlmProvider, LlmUsage } from "@/ai/providers/types";

function buildResponse(serviceName: string): CrossModelAdjudicationResponse {
  if (serviceName.includes("invalid-json")) {
    throw new Error("Mock verification: simulated invalid JSON response");
  }
  if (serviceName.includes("timeout")) {
    throw new Error("Mock verification: simulated LLM timeout");
  }
  if (serviceName.includes("disagree")) {
    return crossModelAdjudicationResponseSchema.parse({
      outcome: "disagree",
      rationale: "Independent model would not place this service here given stated constraints.",
    });
  }
  if (serviceName.includes("would-choose")) {
    return crossModelAdjudicationResponseSchema.parse({
      outcome: "would_choose",
      rationale: "Independent model prefers a different decomposition.",
      alternativeChoice: "Extract as dedicated bounded context with async boundary.",
    });
  }
  return crossModelAdjudicationResponseSchema.parse({
    outcome: "agree",
    rationale: "Independent model aligns with the placement given constraints (advisory only).",
  });
}

/** Deterministic verification provider — distinct from generation mock (V5 independence). */
export const mockVerificationProvider: LlmProvider = {
  name: "mock-verification",

  async generateStructured<T extends z.ZodType>(
    params: GenerateStructuredParams<T>,
  ): Promise<{ data: z.infer<T>; usage: LlmUsage }> {
    if (params.promptId !== VERIFICATION_ADJUDICATION_CROSSMODEL_PROMPT.id) {
      throw new Error(`Mock verification provider: unsupported prompt ${params.promptId}`);
    }

    const serviceName = params.variables.serviceName ?? "unknown";
    const data = buildResponse(serviceName);

    return {
      data: data as z.infer<T>,
      usage: {
        inputTokens: 120,
        outputTokens: 80,
        model: "mock-verification-crossmodel",
      },
    };
  },
};
