import { and, eq } from "drizzle-orm";
import type { AppTx } from "@/db/client";
import { schema } from "@/db/schema";
import type { GenerationPlan } from "./mock-plan";
import { sanitizeLineageNodes, validateTraceCompleteness, type ReferentialContext } from "./lineage-integrity";

export class LineageIntegrityError extends Error {
  constructor(
    message: string,
    public readonly code: "referential_integrity" | "trace_incomplete",
  ) {
    super(message);
    this.name = "LineageIntegrityError";
  }
}

const LAYER_ORDER: Record<string, number> = {
  gateway: 0,
  security: 1,
  services: 2,
  cache: 3,
  messaging: 4,
  database: 5,
};

export async function persistGenerationResult(
  tx: AppTx,
  architectureId: string,
  plan: GenerationPlan,
  ctx: ReferentialContext,
): Promise<void> {
  for (const trace of plan.traces) {
    const check = validateTraceCompleteness(trace);
    if (!check.ok) {
      throw new LineageIntegrityError(check.reason, "trace_incomplete");
    }
  }

  const { nodes: safeNodes } = sanitizeLineageNodes(plan.lineageNodes, ctx);

  const layerIds = new Map<string, string>();
  for (const svc of plan.services) {
    if (layerIds.has(svc.layer)) continue;
    const [existing] = await tx
      .select({ id: schema.archLayers.id })
      .from(schema.archLayers)
      .where(
        and(
          eq(schema.archLayers.architectureId, architectureId),
          eq(schema.archLayers.type, svc.layer),
        ),
      )
      .limit(1);
    if (existing) {
      layerIds.set(svc.layer, existing.id);
      continue;
    }
    const [layer] = await tx
      .insert(schema.archLayers)
      .values({
        architectureId,
        type: svc.layer,
        displayName: svc.layer,
        layerOrder: LAYER_ORDER[svc.layer] ?? 2,
        confidenceScore: 80,
      })
      .returning({ id: schema.archLayers.id });
    if (layer) layerIds.set(svc.layer, layer.id);
  }

  const serviceIds: string[] = [];
  const confidenceByIndex = [90, 79, 85, 88, 86, 84];
  for (let i = 0; i < plan.services.length; i++) {
    const svc = plan.services[i]!;
    const pos = plan.layout.get(svc.name) ?? { canvasX: 100 + i * 160, canvasY: 80 + i * 100 };
    await tx.insert(schema.archServices).values({
      id: svc.serviceId,
      architectureId,
      layerId: layerIds.get(svc.layer) ?? null,
      name: svc.name,
      displayName: svc.displayName,
      category: svc.layer,
      confidenceScore: confidenceByIndex[i] ?? 85,
      status: "done",
      description: svc.rationale.slice(0, 500),
      rationale: svc.rationale,
      canvasX: pos.canvasX,
      canvasY: pos.canvasY,
    });
    serviceIds.push(svc.serviceId);
  }

  let connectionCount = 0;
  for (const spec of plan.connections) {
    await tx.insert(schema.serviceConnections).values({
      architectureId,
      fromServiceId: spec.fromServiceId,
      toServiceId: spec.toServiceId,
      protocol: spec.protocol,
      authMethod: spec.authMethod,
      isContractDefined: true,
    });
    connectionCount += 1;
  }

  const demoService =
    plan.services.find((s) => s.layer === "services") ?? plan.services[0];
  const paymentServiceId = demoService?.serviceId;
  if (paymentServiceId) {
    const [arch] = await tx
      .select({
        organizationId: schema.architectures.organizationId,
        rulesetId: schema.architectures.rulesetId,
      })
      .from(schema.architectures)
      .where(eq(schema.architectures.id, architectureId))
      .limit(1);
    let rulesetId = arch?.rulesetId ?? null;
    if (!rulesetId && arch) {
      const [rs] = await tx
        .select({ id: schema.governanceRulesets.id })
        .from(schema.governanceRulesets)
        .where(
          and(
            eq(schema.governanceRulesets.organizationId, arch.organizationId),
            eq(schema.governanceRulesets.isDefault, true),
          ),
        )
        .limit(1);
      rulesetId = rs?.id ?? null;
    }
    if (rulesetId) {
      const [rule] = await tx
        .select({ id: schema.governanceRules.id, code: schema.governanceRules.code })
        .from(schema.governanceRules)
        .where(eq(schema.governanceRules.rulesetId, rulesetId))
        .limit(1);
      if (rule) {
        await tx.insert(schema.governanceIssues).values({
          architectureId,
          serviceId: paymentServiceId,
          ruleId: rule.id,
          ruleCode: rule.code,
          severity: "critical",
          message: "Mock critical boundary issue for canvas tier demo",
          status: "open",
        });
      }
    }
  }

  for (const node of safeNodes) {
    await tx
      .insert(schema.decisionLineageNodes)
      .values({
        id: node.id,
        architectureId,
        type: node.type,
        label: node.label,
        detail: node.detail,
        sourceKind: node.source?.kind ?? null,
        sourceRef: node.source?.ref ?? null,
        sourceConfidence: node.source?.confidence ?? null,
        serviceId: node.serviceId ?? null,
      })
      .onConflictDoNothing();
  }

  for (const edge of plan.lineageEdges) {
    await tx.insert(schema.decisionLineageEdges).values({
      architectureId,
      fromNodeId: edge.fromNodeId,
      toNodeId: edge.toNodeId,
      type: edge.type,
      rationale: edge.rationale,
    });
  }

  for (const trace of plan.traces) {
    await tx.insert(schema.decisionTraces).values({
      architectureId,
      serviceId: trace.serviceId,
      traceJson: trace,
      confidence: trace.confidence,
    });
  }

  const complete = plan.events.find((e) => e.type === "complete");
  const payload = complete?.type === "complete" ? complete.payload : null;

  await tx
    .update(schema.architectures)
    .set({
      status: "ready",
      totalServices: plan.services.length,
      totalConnections: connectionCount,
      confidenceScore: payload?.finalConfidenceScore ?? 85,
      governanceScore: payload?.finalGovernanceScore ?? 88,
      aiTrustScore: 80,
      generatedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(schema.architectures.id, architectureId));
}
