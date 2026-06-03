import type {
  DecisionTrace,
  GenerationStreamEvent,
  LineageEdge,
  LineageNode,
} from "@architectai/shared";
import { phaseForServiceIndex, withGenerationPhase } from "@/lib/generation-phases";
import type { GeneratedServiceSpec, GenerationServiceBlueprint } from "@/ai/schemas/generation-plan";
import type { QuestionRow } from "./types";
import { layoutServices } from "./layout";
import type { GenerationPlan, MockServiceSpec } from "./mock-plan";

const GOVERNANCE_CHECKS = [
  "No direct cross-service database access",
  "mTLS enforced on trust boundaries",
  "Sensitive data isolated per compliance scope",
] as const;

function resolveQuestionRef(
  linkedIndex: number | undefined,
  questions: QuestionRow[],
  fallbackId: string,
): { ref: string; label: string; detail: string } {
  const q =
    linkedIndex != null
      ? questions.find((row) => row.questionIndex === linkedIndex && row.status === "answered")
      : questions.find((row) => row.status === "answered");
  if (!q) {
    return {
      ref: fallbackId,
      label: "Session requirement",
      detail: "Derived from the initial prompt",
    };
  }
  const ans = q.freeformAnswer?.trim() || q.selectedOptionId || "answered";
  const qText = q.questionText?.trim();
  return {
    ref: q.id,
    label: qText ? qText.slice(0, 100) : `Decision input ${q.questionIndex + 1}`,
    detail: qText ? `${qText} → ${ans}` : `Answer: ${ans}`,
  };
}

export function buildGenerationPlanFromBlueprint(
  architectureId: string,
  blueprint: GenerationServiceBlueprint,
  answeredQuestions: QuestionRow[],
  ruleCodes: string[],
  initialPrompt: string,
): GenerationPlan {
  const rule = ruleCodes[0] ?? "AP-001";
  const nameToId = new Map<string, string>();
  const services: MockServiceSpec[] = blueprint.services.map((seed, idx) => {
    const serviceId = crypto.randomUUID();
    nameToId.set(seed.name, serviceId);
    const qIdx = seed.lineage.linkedQuestionIndex ?? idx % Math.max(answeredQuestions.length, 1);
    const q = answeredQuestions.find((row) => row.questionIndex === qIdx && row.status === "answered");
    return {
      serviceId,
      name: seed.name,
      displayName: seed.displayName,
      layer: seed.layer,
      rationale: seed.rationale,
      requirementQuestionId: q?.id ?? answeredQuestions[0]?.id ?? "prompt",
      ruleCode: ruleCodes[idx] ?? rule,
    };
  });

  const layout = layoutServices(
    blueprint.services.map((s) => ({ name: s.name, layer: s.layer })),
  );

  const lineageNodes: LineageNode[] = [];
  const lineageEdges: LineageEdge[] = [];
  const traces: DecisionTrace[] = [];

  const prdNodeId = crypto.randomUUID();
  lineageNodes.push({
    id: prdNodeId,
    type: "requirement",
    label: "Session requirement",
    detail: initialPrompt.slice(0, 280),
    source: { kind: "prd-span", ref: "initial-prompt", confidence: 95 },
  });

  for (const svc of blueprint.services) {
    const spec = services.find((s) => s.name === svc.name)!;
    const req = resolveQuestionRef(
      svc.lineage.linkedQuestionIndex,
      answeredQuestions,
      spec.requirementQuestionId,
    );

    const reqId = crypto.randomUUID();
    const constraintId = crypto.randomUUID();
    const patternId = crypto.randomUUID();
    const ruleId = crypto.randomUUID();
    const contractId = crypto.randomUUID();
    const componentId = crypto.randomUUID();
    const altIds: string[] = [];

    lineageNodes.push(
      {
        id: reqId,
        type: "requirement",
        label: svc.lineage.requirementLabel || req.label,
        detail: svc.lineage.requirementDetail || req.detail,
        source: { kind: "interrogation", ref: spec.requirementQuestionId, confidence: 90 },
      },
      {
        id: constraintId,
        type: "constraint",
        label: svc.lineage.constraintLabel,
        detail: svc.lineage.constraintDetail,
        source: { kind: "inference", ref: `constraint-${svc.name}`, confidence: 82 },
      },
      {
        id: patternId,
        type: "pattern",
        label: svc.displayName,
        detail: svc.rationale,
        serviceId: spec.serviceId,
      },
      {
        id: ruleId,
        type: "rule",
        label: spec.ruleCode,
        detail: "Governance rule applied to this component",
        source: { kind: "rule", ref: spec.ruleCode, confidence: 92 },
      },
      {
        id: contractId,
        type: "contract",
        label: `${svc.name} API`,
        detail: `Contract surface for ${svc.displayName}`,
        source: { kind: "inference", ref: `contract-${spec.serviceId}`, confidence: 80 },
      },
      {
        id: componentId,
        type: "component",
        label: svc.displayName,
        detail: "Architecture canvas component",
        serviceId: spec.serviceId,
      },
    );

    for (const alt of svc.lineage.rejectedAlternatives) {
      const altId = crypto.randomUUID();
      altIds.push(altId);
      lineageNodes.push({
        id: altId,
        type: "alternative",
        label: alt.label,
        detail: alt.reason,
        serviceId: spec.serviceId,
      });
    }

    const assumptionIds = svc.lineage.assumptions.map((text) => {
      const id = crypto.randomUUID();
      lineageNodes.push({
        id,
        type: "assumption",
        label: text.slice(0, 60),
        detail: text,
        source: { kind: "inference", ref: `assume-${svc.name}-${id.slice(0, 8)}`, confidence: 70 },
      });
      return id;
    });

    lineageEdges.push(
      { id: crypto.randomUUID(), fromNodeId: prdNodeId, toNodeId: reqId, type: "derives", rationale: "Prompt drives requirement" },
      { id: crypto.randomUUID(), fromNodeId: reqId, toNodeId: constraintId, type: "derives", rationale: svc.lineage.constraintDetail },
      { id: crypto.randomUUID(), fromNodeId: constraintId, toNodeId: patternId, type: "selects", rationale: svc.rationale },
      { id: crypto.randomUUID(), fromNodeId: ruleId, toNodeId: patternId, type: "governs", rationale: `Rule ${spec.ruleCode}` },
      { id: crypto.randomUUID(), fromNodeId: patternId, toNodeId: contractId, type: "produces", rationale: "API contract" },
      { id: crypto.randomUUID(), fromNodeId: patternId, toNodeId: componentId, type: "impacts", rationale: "Deployed component" },
    );
    for (const altId of altIds) {
      lineageEdges.push({
        id: crypto.randomUUID(),
        fromNodeId: patternId,
        toNodeId: altId,
        type: "rejects",
        rationale: "Alternative not selected",
      });
    }

    traces.push({
      serviceId: spec.serviceId,
      summary: svc.lineage.traceSummary,
      requirementNodeIds: [reqId],
      constraintNodeIds: [constraintId],
      selectedPatternNodeId: patternId,
      rejectedAlternativeNodeIds: altIds,
      governanceRuleNodeIds: [ruleId],
      contractNodeIds: [contractId],
      downstreamImplicationNodeIds: [],
      assumptionNodeIds: assumptionIds,
      confidence: 85,
    });
  }

  const connections = blueprint.connections
    .map((c) => {
      const from = nameToId.get(c.fromService);
      const to = nameToId.get(c.toService);
      if (!from || !to) return null;
      return {
        fromServiceId: from,
        toServiceId: to,
        protocol: c.protocol,
        authMethod: c.authMethod,
      };
    })
    .filter((c): c is NonNullable<typeof c> => c != null);

  const events = buildStreamEvents(architectureId, services, lineageNodes, lineageEdges, traces);

  return {
    services,
    connections,
    layout,
    events,
    lineageNodes,
    lineageEdges,
    traces,
  };
}

function buildStreamEvents(
  architectureId: string,
  services: MockServiceSpec[],
  lineageNodes: LineageNode[],
  lineageEdges: LineageEdge[],
  traces: DecisionTrace[],
): GenerationStreamEvent[] {
  const events: GenerationStreamEvent[] = [];
  const totalNodes = services.length;

  events.push({
    type: "progress",
    payload: withGenerationPhase(
      {
        progress: 5,
        confidenceScore: 70,
        governanceScore: 72,
        aiTrustScore: 68,
        nodesGenerated: 0,
        totalNodes,
        estimatedSecondsRemaining: totalNodes * 2,
      },
      "requirements",
    ),
  });

  for (const check of GOVERNANCE_CHECKS) {
    events.push({ type: "governance", payload: { checkText: check, done: true } });
  }

  services.forEach((svc, i) => {
    const trace = traces[i]!;
    const svcNodes = lineageNodes.filter((n) =>
      [
        ...trace.requirementNodeIds,
        ...trace.constraintNodeIds,
        trace.selectedPatternNodeId,
        ...trace.rejectedAlternativeNodeIds,
        ...trace.governanceRuleNodeIds,
        ...trace.contractNodeIds,
        ...trace.assumptionNodeIds,
      ].includes(n.id),
    );
    const svcEdges = lineageEdges.filter((e) =>
      svcNodes.some((n) => n.id === e.fromNodeId || n.id === e.toNodeId),
    );
    events.push({
      type: "node",
      payload: {
        serviceId: svc.serviceId,
        name: svc.name,
        layer: svc.layer,
        status: i === totalNodes - 1 ? "done" : "active",
        confidenceScore: 80 + i * 3,
        icon: "box",
      },
    });
    events.push({
      type: "lineage",
      payload: { nodes: svcNodes, edges: svcEdges, trace },
    });
    events.push({
      type: "progress",
      payload: withGenerationPhase(
        {
          progress: Math.round(((i + 1) / totalNodes) * 100),
          confidenceScore: 82,
          governanceScore: 88,
          aiTrustScore: 79,
          nodesGenerated: i + 1,
          totalNodes,
          estimatedSecondsRemaining: Math.max(0, (totalNodes - i - 1) * 2),
        },
        phaseForServiceIndex(i, totalNodes),
      ),
    });
  });

  events.push({
    type: "complete",
    payload: {
      architectureId,
      finalConfidenceScore: 86,
      finalGovernanceScore: 90,
      totalServices: totalNodes,
      totalGovernanceRulesApplied: GOVERNANCE_CHECKS.length,
      criticalIssueCount: 0,
      workspaceUrl: `/workspace/${architectureId}`,
    },
  });

  return events;
}

export function seedsFromMockDomain(prompt: string): GenerationServiceBlueprint {
  const p = prompt.toLowerCase();
  if (p.includes("health") || p.includes("hipaa") || p.includes("clinical")) {
    return {
      services: [
        mk("patient-api", "Patient API", "gateway", 0, "FHIR ingress for clinical workflows"),
        mk("ehr-adapter", "EHR Adapter", "services", 1, "HL7/FHIR normalization"),
        mk("consent-service", "Consent Service", "security", 2, "HIPAA consent enforcement"),
        mk("audit-logger", "Audit Logger", "messaging", 1, "Immutable PHI access trail"),
        mk("clinical-db", "Clinical Store", "database", 1, "Encrypted patient records"),
        mk("session-cache", "Session Cache", "cache", 2, "FHIR session and token cache"),
      ],
      connections: [
        conn("patient-api", "ehr-adapter"),
        conn("patient-api", "consent-service"),
        conn("patient-api", "session-cache", "internal", "none"),
        conn("ehr-adapter", "clinical-db", "gRPC", "mTLS"),
        conn("consent-service", "audit-logger", "Kafka", "mTLS"),
      ],
    };
  }
  if (p.includes("iot") || p.includes("telemetry") || p.includes("sensor")) {
    return {
      services: [
        mk("ingest-gateway", "Ingest Gateway", "gateway", 0, "Device telemetry ingress"),
        mk("stream-processor", "Stream Processor", "services", 0, "Real-time aggregation"),
        mk("device-registry", "Device Registry", "security", 2, "Device identity"),
        mk("event-bus", "Event Bus", "messaging", 0, "Durable telemetry fan-out"),
        mk("ts-database", "Time-Series DB", "database", 0, "Hot telemetry storage"),
      ],
      connections: [
        conn("ingest-gateway", "stream-processor"),
        conn("ingest-gateway", "device-registry"),
        conn("stream-processor", "event-bus"),
        conn("event-bus", "ts-database", "Kafka", "mTLS"),
      ],
    };
  }
  return {
    services: [
      mk("api-gateway", "API Gateway", "gateway", 0, "North-south traffic control"),
      mk("web-bff", "Web BFF", "gateway", 0, "Browser and mobile client aggregation"),
      mk("domain-service", "Domain Service", "services", 1, "Core business logic from requirements"),
      mk("workflow-service", "Workflow Service", "services", 2, "Orchestration and sagas"),
      mk("redis-cache", "Redis Cache", "cache", 1, "Session and hot-read cache"),
      mk("policy-engine", "Policy Engine", "security", 2, "AuthZ and compliance policies"),
      mk("event-bus", "Event Bus", "messaging", 1, "Async partner integrations"),
      mk("operational-db", "Operational DB", "database", 1, "Transactional store"),
    ],
    connections: [
      conn("web-bff", "api-gateway"),
      conn("api-gateway", "domain-service"),
      conn("api-gateway", "policy-engine"),
      conn("domain-service", "workflow-service"),
      conn("domain-service", "redis-cache", "internal", "none"),
      conn("domain-service", "event-bus"),
      conn("domain-service", "operational-db", "gRPC", "mTLS"),
      conn("event-bus", "operational-db", "Kafka", "mTLS"),
    ],
  };
}

function mk(
  name: string,
  displayName: string,
  layer: GeneratedServiceSpec["layer"],
  qIdx: number,
  rationale: string,
): GeneratedServiceSpec {
  return {
    name,
    displayName,
    layer,
    rationale,
    lineage: {
      requirementLabel: `Requirement theme Q${qIdx + 1}`,
      requirementDetail: rationale,
      constraintLabel: "Non-functional constraint",
      constraintDetail: `Derived from scale/security/compliance answers for ${displayName}`,
      traceSummary: `${displayName}: ${rationale}`,
      linkedQuestionIndex: qIdx,
      rejectedAlternatives: [{ label: "Monolith shortcut", reason: "Insufficient isolation for stated NFRs" }],
      assumptions: ["Managed cloud deployment"],
    },
  };
}

function conn(
  from: string,
  to: string,
  protocol: GenerationServiceBlueprint["connections"][number]["protocol"] = "REST",
  authMethod: GenerationServiceBlueprint["connections"][number]["authMethod"] = "JWT",
) {
  return { fromService: from, toService: to, protocol, authMethod };
}
