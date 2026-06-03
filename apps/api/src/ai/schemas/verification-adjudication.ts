import { z } from "zod";

export const crossModelAdjudicationResponseSchema = z.object({
  outcome: z.enum(["agree", "disagree", "would_choose"]),
  rationale: z.string().min(1),
  alternativeChoice: z.string().optional(),
});

export type CrossModelAdjudicationResponse = z.infer<typeof crossModelAdjudicationResponseSchema>;
