import { z } from "zod";
import type { CursorConfig } from "@architectai/shared";

const rulePick = z.object({
  id: z.string().uuid(),
  code: z.string(),
  type: z.string(),
  severity: z.string(),
  condition: z.unknown(),
  autoFixStrategy: z.unknown().nullable(),
});

export const cursorConfigSchema = z.object({
  architectureId: z.string().uuid(),
  organizationId: z.string().uuid(),
  architectureName: z.string(),
  governanceRules: z.array(rulePick),
  monitoredPaths: z.array(z.string()),
  ignoredPaths: z.array(z.string()),
  driftCheckEndpoint: z.string().min(1),
  wsEndpoint: z.string().min(1),
  apiToken: z.string().min(1),
});

export function validateCursorConfig(config: CursorConfig): CursorConfig {
  return cursorConfigSchema.parse(config) as CursorConfig;
}
