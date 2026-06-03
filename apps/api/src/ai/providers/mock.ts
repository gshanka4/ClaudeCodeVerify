import type { z } from "zod";
import { GENERATION_PLAN_PROMPT } from "@/ai/prompts/generation-plan";
import { INTERROGATION_NEXT_QUESTION_PROMPT } from "@/ai/prompts/interrogation";
import { INTERROGATION_PLAN_PROMPT } from "@/ai/prompts/interrogation-plan";
import {
  generationServiceBlueprintSchema,
  type GenerationServiceBlueprint,
} from "@/ai/schemas/generation-plan";
import { interrogationPlanSchema } from "@/ai/schemas/interrogation-plan";
import type { GenerateStructuredParams, LlmProvider, LlmUsage } from "@/ai/providers/types";
import {
  buildMockQuestion,
  buildMockQuestionBatch,
} from "@/ai/providers/mock-interrogation";
import { seedsFromMockDomain } from "@/generation/plan-builder";
import { ensureLayerCoverage } from "@/generation/ensure-layer-coverage";

function parseIndex(variables: Record<string, string>): number {
  return Number.parseInt(variables.questionIndex ?? "0", 10);
}

function parseCategoriesUsed(variables: Record<string, string>): string[] {
  const raw = variables.categoriesUsed ?? "";
  return raw ? raw.split(",").map((s) => s.trim()).filter(Boolean) : [];
}

/** Deterministic provider for tests and local dev without API keys. */
export const mockLlmProvider: LlmProvider = {
  name: "mock",

  async generateStructured<T extends z.ZodType>(
    params: GenerateStructuredParams<T>,
  ): Promise<{ data: z.infer<T>; usage: LlmUsage }> {
    if (params.promptId === INTERROGATION_PLAN_PROMPT.id) {
      const data = interrogationPlanSchema.parse({ questions: buildMockQuestionBatch() });
      return {
        data: data as z.infer<T>,
        usage: { inputTokens: 0, outputTokens: 0, model: "mock-interrogation" },
      };
    }

    if (params.promptId === INTERROGATION_NEXT_QUESTION_PROMPT.id) {
      const index = parseIndex(params.variables);
      const categoriesUsed = parseCategoriesUsed(params.variables);
      const data = buildMockQuestion(index, categoriesUsed);
      return {
        data: data as z.infer<T>,
        usage: { inputTokens: 0, outputTokens: 0, model: "mock-interrogation" },
      };
    }

    if (params.promptId === GENERATION_PLAN_PROMPT.id) {
      const digest = params.variables.requirementsDigest ?? params.variables.initialPrompt ?? "";
      const blueprint: GenerationServiceBlueprint = ensureLayerCoverage(
        seedsFromMockDomain(digest),
      );
      const parsed = generationServiceBlueprintSchema.parse(blueprint);
      return {
        data: parsed as z.infer<T>,
        usage: { inputTokens: 0, outputTokens: 0, model: "mock-generation" },
      };
    }

    throw new Error(`Mock provider: unsupported prompt ${params.promptId}`);
  },
};
