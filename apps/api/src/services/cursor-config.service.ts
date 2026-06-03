import { eq } from "drizzle-orm";
import type { CursorConfig, GovernanceRule } from "@architectai/shared";
import type { AppTx } from "@/db/client";
import { schema } from "@/db/schema";
import { validateCursorConfig } from "@/export/cursor-config-schema";
import { toGovernanceRules } from "@/engine/evaluate";
import { ApiError } from "@/lib/errors";

export interface ApiEndpoints {
  apiBaseUrl: string;
  wsBaseUrl: string;
}

export function defaultApiEndpoints(): ApiEndpoints {
  const apiBaseUrl = process.env.PUBLIC_API_URL ?? "http://localhost:4000";
  const wsBaseUrl = process.env.PUBLIC_WS_URL ?? "ws://localhost:4000/ws";
  return { apiBaseUrl, wsBaseUrl };
}

async function loadRulesForArchitecture(
  tx: AppTx,
  architectureId: string,
): Promise<GovernanceRule[]> {
  const [arch] = await tx
    .select({ rulesetId: schema.architectures.rulesetId, organizationId: schema.architectures.organizationId })
    .from(schema.architectures)
    .where(eq(schema.architectures.id, architectureId))
    .limit(1);
  if (!arch) return [];

  let rulesetId = arch.rulesetId;
  if (!rulesetId) {
    const [rs] = await tx
      .select({ id: schema.governanceRulesets.id })
      .from(schema.governanceRulesets)
      .where(eq(schema.governanceRulesets.organizationId, arch.organizationId))
      .limit(1);
    rulesetId = rs?.id ?? null;
  }
  if (!rulesetId) return [];

  const rows = await tx
    .select()
    .from(schema.governanceRules)
    .where(eq(schema.governanceRules.rulesetId, rulesetId));
  return toGovernanceRules(rows);
}

export async function buildCursorConfig(
  tx: AppTx,
  workspace: typeof schema.cursorWorkspaces.$inferSelect,
  endpoints: ApiEndpoints = defaultApiEndpoints(),
): Promise<CursorConfig> {
  const [arch] = await tx
    .select({ name: schema.architectures.name })
    .from(schema.architectures)
    .where(eq(schema.architectures.id, workspace.architectureId))
    .limit(1);
  if (!arch) throw ApiError.notFound("Architecture not found");

  const rules = await loadRulesForArchitecture(tx, workspace.architectureId);
  const config: CursorConfig = {
    architectureId: workspace.architectureId,
    organizationId: workspace.organizationId,
    architectureName: arch.name,
    governanceRules: rules.map((r) => ({
      id: r.id,
      code: r.code,
      type: r.type,
      severity: r.severity,
      condition: r.condition,
      autoFixStrategy: r.autoFixStrategy,
    })),
    monitoredPaths: workspace.monitoredPaths,
    ignoredPaths: workspace.ignoredPaths,
    driftCheckEndpoint: `${endpoints.apiBaseUrl}/api/drift/check`,
    wsEndpoint: endpoints.wsBaseUrl,
    apiToken: workspace.apiToken,
  };
  return validateCursorConfig(config);
}
