import type {
  DecisionTrace,
  GenerationStreamEvent,
  LayerType,
  LineageEdge,
  LineageNode,
} from "@architectai/shared";
import type { LayoutPosition } from "./layout";
import type { QuestionRow } from "./types";
import { buildGenerationPlanFromBlueprint, seedsFromMockDomain } from "./plan-builder";
import { ensureLayerCoverage } from "./ensure-layer-coverage";

export interface MockServiceSpec {
  serviceId: string;
  name: string;
  displayName: string;
  layer: LayerType;
  requirementQuestionId: string;
  ruleCode: string;
  rationale: string;
}

export interface PlanConnection {
  fromServiceId: string;
  toServiceId: string;
  protocol: "REST" | "gRPC" | "Kafka" | "WebSocket" | "AMQP" | "internal";
  authMethod: "mTLS" | "JWT" | "API-key" | "OAuth2-CC" | "none";
}

export interface GenerationPlan {
  services: MockServiceSpec[];
  connections: PlanConnection[];
  layout: Map<string, LayoutPosition>;
  events: GenerationStreamEvent[];
  lineageNodes: LineageNode[];
  lineageEdges: LineageEdge[];
  traces: DecisionTrace[];
}

export function buildMockGenerationPlan(
  architectureId: string,
  answeredQuestions: QuestionRow[],
  ruleCodes: string[],
  initialPrompt: string,
): GenerationPlan {
  const blueprint = ensureLayerCoverage(seedsFromMockDomain(initialPrompt));
  return buildGenerationPlanFromBlueprint(
    architectureId,
    blueprint,
    answeredQuestions,
    ruleCodes,
    initialPrompt,
  );
}

/** Plan with a fabricated interrogation ref for P3-EC-01 tests. */
export function buildPlanWithBadRef(
  architectureId: string,
  answeredQuestions: QuestionRow[],
  ruleCodes: string[],
  initialPrompt: string,
): GenerationPlan {
  const plan = buildMockGenerationPlan(architectureId, answeredQuestions, ruleCodes, initialPrompt);
  plan.lineageNodes.push({
    id: crypto.randomUUID(),
    type: "requirement",
    label: "Fabricated",
    detail: "Should be stripped",
    source: { kind: "interrogation", ref: "00000000-0000-0000-0000-000000000000", confidence: 99 },
  });
  return plan;
}
