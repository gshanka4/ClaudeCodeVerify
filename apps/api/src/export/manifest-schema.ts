import { z } from "zod";

/** Export manifest schema — extra verification fields are optional for backward compatibility. */
export const exportManifestSchema = z
  .object({
    schemaVersion: z.number(),
    architectureId: z.string().uuid(),
    organizationId: z.string().uuid(),
    name: z.string(),
    version: z.number(),
    status: z.string(),
    environmentTarget: z.string(),
    exportedAt: z.string(),
    governanceScore: z.number(),
    driftScore: z.number(),
    verificationRunId: z.string().uuid().optional(),
    trustGrade: z.number().min(0).max(100).optional(),
    trustGradeBreakdown: z
      .object({
        score: z.number(),
        verificationScore: z.number(),
        deductions: z.array(z.unknown()),
        overrides: z.array(z.unknown()),
      })
      .optional(),
    overrides: z
      .array(
        z.object({
          findingId: z.string().uuid(),
          reason: z.string(),
          createdAt: z.string(),
        }),
      )
      .optional(),
  })
  .passthrough();

export function validateExportManifest(manifest: unknown): Record<string, unknown> {
  return exportManifestSchema.parse(manifest) as Record<string, unknown>;
}
