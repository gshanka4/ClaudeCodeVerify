import type {
  CodeDiff,
  ContractDiagram,
  DriftCheckResponse,
  DriftEvent,
  DriftSeverity,
  RuleSeverity,
} from "@architectai/shared";
import { and, eq } from "drizzle-orm";
import type { AppTx } from "@/db/client";
import { schema } from "@/db/schema";
import { autofixFromStrategy } from "@/engine/autofix";
import { DriftCheckCache } from "@/engine/cache";
import { evaluateFile } from "@/engine/evaluate";
import { RuleIndex } from "@/engine/rule-index";
import type { RuleViolation } from "@/engine/types";
import { ApiError } from "@/lib/errors";
import type { WorkspaceContext } from "@/middleware/workspace-auth";
import { recordAudit } from "@/services/audit.service";
import { loadActiveRulesForArchitecture } from "@/services/governance.service";
import type { AuthContext } from "@/middleware/auth";

const SCORE_BY_SEVERITY: Record<DriftSeverity, number> = {
  critical: 25,
  high: 15,
  medium: 8,
  low: 3,
};

function toDriftSeverity(severity: RuleSeverity): DriftSeverity {
  return severity === "info" ? "low" : severity;
}

function defaultDiagram(label: string): ContractDiagram {
  return {
    label,
    steps: [{ from: "agreed", to: "service", isViolation: false }],
  };
}

function violationDiagram(v: RuleViolation): ContractDiagram {
  return {
    label: v.rule.name,
    steps: [
      { from: "agreed", to: "service" },
      { from: "service", to: "violation", isViolation: true },
    ],
  };
}

function rowToEvent(row: typeof schema.driftEvents.$inferSelect): DriftEvent {
  return {
    id: row.id,
    organizationId: row.organizationId,
    architectureId: row.architectureId,
    userId: row.userId,
    filePath: row.filePath,
    severity: row.severity,
    status: row.status,
    driftScore: row.driftScore,
    ruleCode: row.ruleCode,
    ruleName: row.ruleName,
    whatHappened: row.whatHappened,
    agreedContract: row.agreedContractJson as ContractDiagram,
    currentViolation: row.currentViolationJson as ContractDiagram,
    impact: (row.impactJson as DriftEvent["impact"]) ?? [],
    autoFix: (row.autoFixDiffJson as CodeDiff | null) ?? null,
    detectedAt: row.detectedAt,
    resolvedAt: row.resolvedAt,
  };
}

export interface DriftEngineState {
  ruleIndex: RuleIndex;
  cache: DriftCheckCache;
}

export function createDriftEngineState(): DriftEngineState {
  return { ruleIndex: new RuleIndex(), cache: new DriftCheckCache() };
}

export async function checkDrift(
  tx: AppTx,
  workspace: WorkspaceContext,
  engine: DriftEngineState,
  input: { architectureId: string; filePath: string; fileContent: string },
): Promise<DriftCheckResponse & { workspaceId: string }> {
  if (input.architectureId !== workspace.architectureId) {
    throw ApiError.forbidden("Workspace token does not match architecture");
  }

  const [arch] = await tx
    .select()
    .from(schema.architectures)
    .where(eq(schema.architectures.id, input.architectureId))
    .limit(1);
  if (!arch) throw ApiError.notFound("Architecture not found");

  const rules = await loadActiveRulesForArchitecture(tx, input.architectureId);
  const evalResult = evaluateFile(engine, {
    architectureId: input.architectureId,
    architectureVersion: arch.version,
    filePath: input.filePath,
    fileContent: input.fileContent,
    rules,
  });

  if (evalResult.parseError) {
    return {
      hasDrift: false,
      drifts: [],
      newDriftScore: arch.driftScore,
      workspaceId: workspace.workspaceId,
    };
  }

  const drifts: DriftEvent[] = [];
  for (const v of evalResult.violations) {
    const driftSeverity = toDriftSeverity(v.severity);
    const score = SCORE_BY_SEVERITY[driftSeverity] ?? 5;
    const autoFix = autofixFromStrategy(
      input.filePath,
      input.fileContent,
      v.rule.autoFixStrategy,
      v.rule.code,
    );
    const [row] = await tx
      .insert(schema.driftEvents)
      .values({
        organizationId: workspace.organizationId,
        architectureId: input.architectureId,
        userId: workspace.userId,
        ruleId: v.rule.id,
        filePath: input.filePath,
        severity: driftSeverity,
        status: "open",
        driftScore: score,
        ruleCode: v.rule.code,
        ruleName: v.rule.name,
        whatHappened: v.message,
        agreedContractJson: defaultDiagram("Agreed architecture"),
        currentViolationJson: violationDiagram(v),
        impactJson: [],
        autoFixDiffJson: autoFix,
      })
      .returning();
    drifts.push(rowToEvent(row!));

    await recordAudit(tx, {
      organizationId: workspace.organizationId,
      userId: workspace.userId,
      eventType: "drift.detected",
      resourceType: "drift_event",
      resourceId: row!.id,
      payload: { ruleCode: v.rule.code, filePath: input.filePath },
    });
  }

  const [updated] = await tx
    .select({ driftScore: schema.architectures.driftScore })
    .from(schema.architectures)
    .where(eq(schema.architectures.id, input.architectureId))
    .limit(1);

  return {
    hasDrift: drifts.length > 0,
    drifts,
    newDriftScore: updated?.driftScore ?? arch.driftScore,
    workspaceId: workspace.workspaceId,
  };
}

export async function listDriftEvents(
  tx: AppTx,
  architectureId: string,
  filter?: { status?: string },
): Promise<DriftEvent[]> {
  const conds = [eq(schema.driftEvents.architectureId, architectureId)];
  const rows = await tx
    .select()
    .from(schema.driftEvents)
    .where(and(...conds));
  const filtered = filter?.status
    ? rows.filter((r) => r.status === filter.status)
    : rows;
  return filtered.map(rowToEvent);
}

export async function applyDriftFix(
  tx: AppTx,
  auth: AuthContext,
  driftId: string,
): Promise<{ applied: boolean; driftId: string }> {
  const [row] = await tx
    .select()
    .from(schema.driftEvents)
    .where(eq(schema.driftEvents.id, driftId))
    .limit(1);
  if (!row) throw ApiError.notFound("Drift event not found");
  if (row.status === "auto-fixed" || row.status === "ignored") {
    return { applied: false, driftId };
  }

  await tx
    .update(schema.driftEvents)
    .set({ status: "auto-fixed", resolvedAt: new Date() })
    .where(eq(schema.driftEvents.id, driftId));

  await recordAudit(tx, {
    organizationId: auth.organizationId,
    userId: auth.userId,
    eventType: "drift.auto-fixed",
    resourceType: "drift_event",
    resourceId: driftId,
  });

  return { applied: true, driftId };
}

export async function ignoreDrift(
  tx: AppTx,
  auth: AuthContext,
  driftId: string,
): Promise<{ ignored: boolean; driftId: string }> {
  const [row] = await tx
    .select()
    .from(schema.driftEvents)
    .where(eq(schema.driftEvents.id, driftId))
    .limit(1);
  if (!row) throw ApiError.notFound("Drift event not found");
  if (row.status === "ignored" || row.status === "auto-fixed") {
    return { ignored: false, driftId };
  }

  await tx
    .update(schema.driftEvents)
    .set({ status: "ignored", resolvedAt: new Date() })
    .where(eq(schema.driftEvents.id, driftId));

  await recordAudit(tx, {
    organizationId: auth.organizationId,
    userId: auth.userId,
    eventType: "drift.ignored",
    resourceType: "drift_event",
    resourceId: driftId,
  });

  return { ignored: true, driftId };
}

export function invalidateDriftCaches(engine: DriftEngineState, architectureId: string): void {
  engine.ruleIndex.invalidate(architectureId);
  engine.cache.invalidateArchitecture(architectureId);
}
