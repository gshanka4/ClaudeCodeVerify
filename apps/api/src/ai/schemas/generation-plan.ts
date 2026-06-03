import { z } from "zod";

const layerEnum = z.enum([
  "gateway",
  "security",
  "services",
  "cache",
  "messaging",
  "database",
]);

const protocolEnum = z.enum(["REST", "gRPC", "Kafka", "WebSocket", "AMQP", "internal"]);
const authEnum = z.enum(["mTLS", "JWT", "API-key", "OAuth2-CC", "none"]);

export const serviceLineageSchema = z.object({
  requirementLabel: z.string().min(8).max(120),
  requirementDetail: z.string().min(8).max(400),
  constraintLabel: z.string().min(4).max(80),
  constraintDetail: z.string().min(8).max(300),
  traceSummary: z.string().min(12).max(300),
  linkedQuestionIndex: z.number().int().min(0).max(2).optional(),
  rejectedAlternatives: z
    .array(z.object({ label: z.string().min(2), reason: z.string().min(4) }))
    .max(3)
    .default([]),
  assumptions: z.array(z.string().min(4)).max(3).default([]),
});

export const generatedServiceSchema = z.object({
  name: z
    .string()
    .min(2)
    .max(50)
    .regex(/^[a-z0-9-]+$/),
  displayName: z.string().min(2).max(80),
  layer: layerEnum,
  rationale: z.string().min(12).max(500),
  lineage: serviceLineageSchema,
});

export const generatedConnectionSchema = z.object({
  fromService: z.string().min(2).max(50),
  toService: z.string().min(2).max(50),
  protocol: protocolEnum,
  authMethod: authEnum,
});

const REQUIRED_LAYERS = ["gateway", "services", "cache", "database", "security"] as const;

export const generationServiceBlueprintSchema = z
  .object({
    services: z.array(generatedServiceSchema).min(6).max(12),
    connections: z.array(generatedConnectionSchema).min(4).max(24),
  })
  .superRefine((bp, ctx) => {
    for (const layer of REQUIRED_LAYERS) {
      if (layer === "services") {
        if (bp.services.filter((s) => s.layer === "services").length < 2) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: "At least two services-layer components required",
          });
        }
        continue;
      }
      if (!bp.services.some((s) => s.layer === layer)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Missing required layer: ${layer}`,
        });
      }
    }
  });

export type GenerationServiceBlueprint = z.infer<typeof generationServiceBlueprintSchema>;
export type GeneratedServiceSpec = z.infer<typeof generatedServiceSchema>;
