import { z } from "zod";
import { generatedQuestionSchema } from "@/ai/schemas/interrogation";

/** Exactly three high-signal questions generated in one LLM call at session start. */
export const interrogationPlanSchema = z.object({
  questions: z.array(generatedQuestionSchema).length(3),
});

export type InterrogationPlan = z.infer<typeof interrogationPlanSchema>;
