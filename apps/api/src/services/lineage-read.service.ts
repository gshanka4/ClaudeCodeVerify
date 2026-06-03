import type {
  ArchitectureLineage,
  DecisionChainResponse,
  DecisionChainStepDetail,
  DecisionTrace,
  LineageEdge,
  LineageNode,
  LineageSource,
  LineageTopicsResponse,
  ResolvedDecisionTrace,
  ResolvedLineageNode,
  TraceChainStep,
} from "@architectai/shared";
import { and, eq } from "drizzle-orm";
import type { AppTx } from "@/db/client";
import { schema } from "@/db/schema";
import { buildDecisionNarrative } from "@/lib/decision-narrative";
import { rankCriticalDecisions } from "@/lib/rank-critical-decisions";
import {
  type ReferentialContext,
  resolveSource as refResolveSource,
} from "@/generation/lineage-integrity";

function rowToNode(row: typeof schema.decisionLineageNodes.$inferSelect): LineageNode {
  const source: LineageSource | undefined =
    row.sourceKind && row.sourceRef
      ? {
          kind: row.sourceKind,
          ref: row.sourceRef,
          confidence: row.sourceConfidence ?? 0,
        }
      : undefined;
  return {
    id: row.id,
    type: row.type,
    label: row.label,
    detail: row.detail,
    source,
    serviceId: row.serviceId ?? undefined,
  };
}

export async function buildReferentialContext(
  tx: AppTx,
  architectureId: string,
): Promise<ReferentialContext> {
  const [arch] = await tx
    .select({ sessionId: schema.architectures.interrogationSessionId })
    .from(schema.architectures)
    .where(eq(schema.architectures.id, architectureId))
    .limit(1);

  const interrogationRefs = new Set<string>();
  if (arch?.sessionId) {
    const questions = await tx
      .select({ id: schema.interrogationQuestions.id })
      .from(schema.interrogationQuestions)
      .where(eq(schema.interrogationQuestions.sessionId, arch.sessionId));
    for (const q of questions) interrogationRefs.add(q.id);
  }

  const ruleRefs = new Set<string>();
  const rules = await tx
    .select({ code: schema.governanceRules.code })
    .from(schema.governanceRules)
    .innerJoin(
      schema.governanceRulesets,
      eq(schema.governanceRules.rulesetId, schema.governanceRulesets.id),
    )
    .innerJoin(
      schema.architectures,
      eq(schema.architectures.rulesetId, schema.governanceRulesets.id),
    )
    .where(eq(schema.architectures.id, architectureId));
  for (const r of rules) ruleRefs.add(r.code);

  return { interrogationRefs, ruleRefs };
}

export interface RequirementGroundTruth {
  questionId: string;
  label: string;
}

/** Interrogation answers used as requirement ground truth for verification. */
export async function loadRequirementGroundTruth(
  tx: AppTx,
  architectureId: string,
): Promise<RequirementGroundTruth[]> {
  const [arch] = await tx
    .select({ sessionId: schema.architectures.interrogationSessionId })
    .from(schema.architectures)
    .where(eq(schema.architectures.id, architectureId))
    .limit(1);

  if (!arch?.sessionId) return [];

  const questions = await tx
    .select({
      id: schema.interrogationQuestions.id,
      label: schema.interrogationQuestions.questionText,
    })
    .from(schema.interrogationQuestions)
    .where(eq(schema.interrogationQuestions.sessionId, arch.sessionId));

  return questions.map((q) => ({
    questionId: q.id,
    label: q.label,
  }));
}

function resolveNodeSource(node: LineageNode, ctx: ReferentialContext): boolean {
  if (!node.source) return true;
  if (node.source.kind === "interrogation") return ctx.interrogationRefs.has(node.source.ref);
  if (node.source.kind === "rule") return ctx.ruleRefs.has(node.source.ref);
  if (node.source.kind === "prd-span" || node.source.kind === "metric" || node.source.kind === "inference") {
    return node.source.ref.length > 0;
  }
  return false;
}

export function toResolvedNode(node: LineageNode, ctx: ReferentialContext): ResolvedLineageNode {
  const sourceResolved = resolveNodeSource(node, ctx);
  if (!node.source || sourceResolved) {
    return { ...node, sourceResolved: true };
  }
  return { ...node, sourceResolved: false };
}

export async function getArchitectureLineage(
  tx: AppTx,
  architectureId: string,
): Promise<ArchitectureLineage | null> {
  const [arch] = await tx
    .select({ status: schema.architectures.status })
    .from(schema.architectures)
    .where(eq(schema.architectures.id, architectureId))
    .limit(1);
  if (!arch) return null;
  if (arch.status === "generating") {
    return null;
  }

  const nodeRows = await tx
    .select()
    .from(schema.decisionLineageNodes)
    .where(eq(schema.decisionLineageNodes.architectureId, architectureId));
  const edgeRows = await tx
    .select()
    .from(schema.decisionLineageEdges)
    .where(eq(schema.decisionLineageEdges.architectureId, architectureId));
  const traceRows = await tx
    .select()
    .from(schema.decisionTraces)
    .where(eq(schema.decisionTraces.architectureId, architectureId));

  const nodes = nodeRows.map(rowToNode);
  const edges: LineageEdge[] = edgeRows.map((e) => ({
    id: e.id,
    fromNodeId: e.fromNodeId,
    toNodeId: e.toNodeId,
    type: e.type,
    rationale: e.rationale,
  }));
  const traces = traceRows.map((t) => t.traceJson as DecisionTrace);

  return { architectureId, nodes, edges, traces };
}

function buildChain(
  trace: DecisionTrace,
  nodeById: Map<string, ResolvedLineageNode>,
): TraceChainStep[] {
  const pick = (ids: string[], stepType: TraceChainStep["stepType"], label: string, emptyMessage?: string) => {
    const nodes = ids.map((id) => nodeById.get(id)).filter((n): n is ResolvedLineageNode => !!n);
    return { stepType, label, nodes, emptyMessage: nodes.length === 0 ? emptyMessage : undefined };
  };

  return [
    pick(trace.requirementNodeIds, "requirement", "Requirements"),
    pick(trace.constraintNodeIds, "constraint", "Constraints"),
    pick(trace.selectedPatternNodeId ? [trace.selectedPatternNodeId] : [], "pattern", "Selected pattern"),
    pick(
      trace.rejectedAlternativeNodeIds,
      "alternative",
      "Rejected alternatives",
      "No alternatives considered",
    ),
    pick(
      trace.governanceRuleNodeIds,
      "rule",
      "Governance rules",
      "No governance rule applied",
    ),
    pick(trace.contractNodeIds, "contract", "Contracts"),
    pick(trace.downstreamImplicationNodeIds, "implication", "Downstream implications"),
    pick(trace.assumptionNodeIds, "assumption", "Assumptions"),
  ];
}

export async function resolveDecisionTrace(
  tx: AppTx,
  architectureId: string,
  serviceId: string,
): Promise<ResolvedDecisionTrace | null> {
  const [arch] = await tx
    .select({ status: schema.architectures.status })
    .from(schema.architectures)
    .where(eq(schema.architectures.id, architectureId))
    .limit(1);
  if (!arch) return null;
  if (arch.status === "generating") return null;

  const [traceRow] = await tx
    .select()
    .from(schema.decisionTraces)
    .where(
      and(
        eq(schema.decisionTraces.architectureId, architectureId),
        eq(schema.decisionTraces.serviceId, serviceId),
      ),
    )
    .limit(1);
  if (!traceRow) return null;

  const trace = traceRow.traceJson as DecisionTrace & { userDecisionNote?: string };
  const ctx = await buildReferentialContext(tx, architectureId);
  const nodeRows = await tx
    .select()
    .from(schema.decisionLineageNodes)
    .where(eq(schema.decisionLineageNodes.architectureId, architectureId));

  const nodeById = new Map<string, ResolvedLineageNode>();
  const unresolvedNodeIds: string[] = [];
  for (const row of nodeRows) {
    const node = toResolvedNode(rowToNode(row), ctx);
    nodeById.set(node.id, node);
    if (node.source && !node.sourceResolved) unresolvedNodeIds.push(node.id);
  }

  const resolved: ResolvedDecisionTrace = {
    serviceId,
    summary: trace.summary,
    confidence: trace.confidence,
    chain: buildChain(trace, nodeById),
    unresolvedNodeIds,
    userDecisionNote: trace.userDecisionNote,
  };

  const [svc] = await tx
    .select({ displayName: schema.archServices.displayName, name: schema.archServices.name })
    .from(schema.archServices)
    .where(
      and(
        eq(schema.archServices.id, serviceId),
        eq(schema.archServices.architectureId, architectureId),
      ),
    )
    .limit(1);
  const displayName = svc?.displayName ?? svc?.name ?? "Component";
  resolved.narrative = buildDecisionNarrative(displayName, resolved);

  return resolved;
}

/** Re-export for tests that inject bad refs. */
export function resolveSource(source: LineageSource | undefined, ctx: ReferentialContext): boolean {
  if (!source) return true;
  return refResolveSource(source, ctx);
}

export async function getLineageTopics(
  tx: AppTx,
  architectureId: string,
  serviceIdFilter?: string | null,
): Promise<LineageTopicsResponse | null> {
  const lineage = await getArchitectureLineage(tx, architectureId);
  if (!lineage) return null;

  const [arch] = await tx
    .select({ confidenceScore: schema.architectures.confidenceScore })
    .from(schema.architectures)
    .where(eq(schema.architectures.id, architectureId))
    .limit(1);

  const issues = await tx
    .select({
      severity: schema.governanceIssues.severity,
      serviceId: schema.governanceIssues.serviceId,
      message: schema.governanceIssues.message,
    })
    .from(schema.governanceIssues)
    .where(eq(schema.governanceIssues.architectureId, architectureId));

  const ctx = await buildReferentialContext(tx, architectureId);
  const unresolvedNodeIds = new Set<string>();
  for (const node of lineage.nodes) {
    if (node.source && !resolveNodeSource(node, ctx)) unresolvedNodeIds.add(node.id);
  }

  const topics = rankCriticalDecisions({
    lineage,
    issues: issues.map((i) => ({
      severity: i.severity,
      serviceId: i.serviceId,
      message: i.message,
    })),
    confidenceScore: arch?.confidenceScore ?? 0,
    serviceIdFilter: serviceIdFilter ?? undefined,
    limit: 5,
    unresolvedNodeIds,
  });

  return { topics };
}

export async function getDecisionChain(
  tx: AppTx,
  architectureId: string,
  topicId: string,
): Promise<DecisionChainResponse | null> {
  const serviceId = topicId;
  const trace = await resolveDecisionTrace(tx, architectureId, serviceId);
  if (!trace) return null;
  const flatSteps: DecisionChainStepDetail[] = [];
  for (const step of trace.chain) {
    if (step.emptyMessage && step.nodes.length === 0) continue;
    for (const node of step.nodes) {
      flatSteps.push({
        kind: step.stepType,
        label: node.label,
        detail: node.detail,
        source: node.source
          ? {
              kind: node.source.kind,
              ref: node.source.ref,
              confidence: node.source.confidence,
              resolved: node.sourceResolved,
            }
          : undefined,
        rejected: step.stepType === "alternative",
      });
    }
  }
  return { topicId, serviceId, steps: flatSteps };
}
