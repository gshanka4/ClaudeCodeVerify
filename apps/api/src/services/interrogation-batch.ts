import type { LlmGateway } from "@/ai/gateway";
import { buildInterrogationFallbackQuestion } from "@/ai/fallback-question";
import { INTERROGATION_PLAN_PROMPT } from "@/ai/prompts/interrogation-plan";
import type { GeneratedQuestion } from "@/ai/schemas/interrogation";
import { interrogationPlanSchema } from "@/ai/schemas/interrogation-plan";
import { INTERROGATION } from "@architectai/config";
import { logger } from "@/lib/logger";
import { buildMockQuestionBatch } from "@/ai/providers/mock-interrogation";

export async function generateInterrogationBatch(
  llm: LlmGateway,
  initialPrompt: string,
): Promise<GeneratedQuestion[]> {
  const provider = llm.getProviderName("interrogation");

  if (provider === "mock") {
    return buildMockQuestionBatch();
  }

  try {
    const { data } = await llm.generateStructured({
      workload: "interrogation",
      promptId: INTERROGATION_PLAN_PROMPT.id,
      schema: interrogationPlanSchema,
      variables: { initialPrompt: initialPrompt.slice(0, 8000) },
    });
    return data.questions.map((q, i) => ({
      ...q,
      suggestComplete: i === INTERROGATION.maxQuestions - 1,
    }));
  } catch (err) {
    logger.warn({ err }, "Interrogation batch plan failed; using per-index fallbacks");
    return Array.from({ length: INTERROGATION.maxQuestions }, (_, i) =>
      buildInterrogationFallbackQuestion(i),
    );
  }
}
