import { z } from "zod";

const badgeEnum = z.enum(["AI Recommended", "Common Choice", "Enterprise Grade"]).nullable();
const badgeVariantEnum = z.enum(["violet", "emerald", "amber"]).nullable();

export const generatedOptionSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  description: z.string(),
  badge: badgeEnum,
  badgeVariant: badgeVariantEnum,
});

export const generatedQuestionSchema = z.object({
  questionText: z.string().min(10),
  category: z.enum([
    "scale",
    "security",
    "compliance",
    "cloud",
    "data",
    "messaging",
    "deployment",
    "migration",
  ]),
  options: z.array(generatedOptionSchema).min(2).max(4),
  warning: z
    .object({
      level: z.enum(["low", "medium", "critical"]),
      message: z.string(),
      affectedPaths: z.array(z.string()).default([]),
    })
    .nullable()
    .optional(),
  confidenceImpact: z.number().int().min(5).max(30).default(15),
  /** When true, the interrogation can end after this question is addressed. */
  suggestComplete: z.boolean().optional(),
});

export type GeneratedQuestion = z.infer<typeof generatedQuestionSchema>;
