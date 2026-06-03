import { and, eq } from "drizzle-orm";
import type { GovernanceRule } from "@architectai/shared";
import type { AppTx } from "@/db/client";
import { schema } from "@/db/schema";
import { toGovernanceRules } from "@/engine/evaluate";

export interface RulesetDto {
  id: string;
  name: string;
  description: string;
  version: string;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
}

type RulesetRow = typeof schema.governanceRulesets.$inferSelect;

function toRulesetDto(row: RulesetRow): RulesetDto {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    version: row.version,
    isDefault: row.isDefault,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function listRulesets(tx: AppTx): Promise<RulesetDto[]> {
  const rows = await tx.select().from(schema.governanceRulesets);
  return rows.map(toRulesetDto);
}

export interface CreateRulesetInput {
  organizationId: string;
  createdById: string;
  name: string;
  description?: string;
  isDefault?: boolean;
}

export async function createRuleset(tx: AppTx, input: CreateRulesetInput): Promise<RulesetDto> {
  // Enforce the "one default per org" invariant before inserting a new default.
  if (input.isDefault) {
    await tx
      .update(schema.governanceRulesets)
      .set({ isDefault: false })
      .where(eq(schema.governanceRulesets.isDefault, true));
  }
  const [row] = await tx
    .insert(schema.governanceRulesets)
    .values({
      organizationId: input.organizationId,
      createdById: input.createdById,
      name: input.name,
      description: input.description ?? "",
      isDefault: input.isDefault ?? false,
    })
    .returning();
  return toRulesetDto(row!);
}

/** The starter rules seeded with a new org's default ruleset (mirrors docs/03 seed). */
const DEFAULT_RULES = [
  {
    code: "AP-001",
    type: "boundary" as const,
    severity: "critical" as const,
    name: "No Direct Cross-Service DB Access",
    description: "A service must not directly import from another service's database module.",
    rationale: "Direct DB access bypasses auth layers and creates tight coupling.",
    conditionJson: { forbiddenImportPath: "../*-db/*", forbiddenFrom: "*", forbiddenTo: "*-db" },
    autoFixJson: {
      type: "import-replace",
      description: "Replace direct DB import with REST API call through the owning service.",
    },
  },
  {
    code: "C-101",
    type: "contract" as const,
    severity: "high" as const,
    name: "Payment Service Must Use UserService API",
    description: "payment-service must access user data exclusively through the UserService REST API.",
    rationale: "Enforces the agreed data ownership boundary.",
    conditionJson: { forbiddenFrom: "payment-service", forbiddenTo: "user-db" },
    autoFixJson: null,
  },
  {
    code: "AUTH-001",
    type: "auth" as const,
    severity: "critical" as const,
    name: "All External Connections Require mTLS",
    description: "All service-to-service connections crossing a trust boundary must use mTLS.",
    rationale: "Zero-trust architecture requirement for fintech environments.",
    conditionJson: { requiredAuth: "mTLS", appliesTo: "cross-boundary" },
    autoFixJson: null,
  },
];

/**
 * Idempotently seed the default ruleset (+ starter rules) for an org. Used by
 * provisioning and tests. Returns the existing default if one already exists.
 */
export async function seedDefaultRuleset(
  tx: AppTx,
  input: { organizationId: string; createdById: string },
): Promise<RulesetDto> {
  const [existing] = await tx
    .select()
    .from(schema.governanceRulesets)
    .where(
      and(
        eq(schema.governanceRulesets.organizationId, input.organizationId),
        eq(schema.governanceRulesets.isDefault, true),
      ),
    )
    .limit(1);
  if (existing) return toRulesetDto(existing);

  const [ruleset] = await tx
    .insert(schema.governanceRulesets)
    .values({
      organizationId: input.organizationId,
      createdById: input.createdById,
      name: "Default Enterprise Ruleset",
      description:
        "Standard enterprise governance rules for service boundaries, auth, and anti-patterns.",
      isDefault: true,
    })
    .returning();

  await tx.insert(schema.governanceRules).values(
    DEFAULT_RULES.map((r) => ({
      rulesetId: ruleset!.id,
      code: r.code,
      type: r.type,
      severity: r.severity,
      name: r.name,
      description: r.description,
      rationale: r.rationale,
      conditionJson: r.conditionJson,
      autoFixJson: r.autoFixJson,
    })),
  );

  return toRulesetDto(ruleset!);
}

/** Load enabled governance rules for an architecture (org default ruleset fallback). */
export async function loadActiveRulesForArchitecture(
  tx: AppTx,
  architectureId: string,
): Promise<GovernanceRule[]> {
  const [arch] = await tx
    .select({
      rulesetId: schema.architectures.rulesetId,
      organizationId: schema.architectures.organizationId,
    })
    .from(schema.architectures)
    .where(eq(schema.architectures.id, architectureId))
    .limit(1);
  if (!arch) return [];

  let rulesetId = arch.rulesetId;
  if (!rulesetId) {
    const [defaultRs] = await tx
      .select({ id: schema.governanceRulesets.id })
      .from(schema.governanceRulesets)
      .where(
        and(
          eq(schema.governanceRulesets.organizationId, arch.organizationId),
          eq(schema.governanceRulesets.isDefault, true),
        ),
      )
      .limit(1);
    rulesetId = defaultRs?.id ?? null;
  }
  if (!rulesetId) return [];

  const rows = await tx
    .select()
    .from(schema.governanceRules)
    .where(eq(schema.governanceRules.rulesetId, rulesetId));
  return toGovernanceRules(rows);
}
