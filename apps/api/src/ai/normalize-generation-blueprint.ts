import type { GenerationServiceBlueprint } from "@/ai/schemas/generation-plan";
import { ensureLayerCoverage } from "@/generation/ensure-layer-coverage";

type Layer = GenerationServiceBlueprint["services"][number]["layer"];
type Protocol = GenerationServiceBlueprint["connections"][number]["protocol"];
type AuthMethod = GenerationServiceBlueprint["connections"][number]["authMethod"];

const PROTOCOLS = new Set<string>(["REST", "gRPC", "Kafka", "WebSocket", "AMQP", "internal"]);
const AUTH = new Set<string>(["mTLS", "JWT", "API-key", "OAuth2-CC", "none"]);
const LAYERS = new Set<string>([
  "gateway",
  "security",
  "services",
  "cache",
  "messaging",
  "database",
]);

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 50);
}

function padMin(value: string, min: number, fallback: string): string {
  const v = value.trim() || fallback;
  return v.length >= min ? v : `${fallback} ${v}`.slice(0, Math.max(min, 400));
}

function defaultLineage(displayName: string, rationale: string) {
  const label = padMin(displayName, 8, "Requirement");
  const detail = padMin(rationale, 8, "Derived from interrogation session");
  const trace = padMin(rationale, 12, "Architecture decision trace");
  return {
    requirementLabel: label.slice(0, 120),
    requirementDetail: detail.slice(0, 400),
    constraintLabel: "Operational constraint",
    constraintDetail: padMin(rationale, 8, "Session constraints apply").slice(0, 300),
    traceSummary: trace.slice(0, 300),
    linkedQuestionIndex: 0,
    rejectedAlternatives: [],
    assumptions: [] as string[],
  };
}

/** Coerce LLM JSON into a valid generation blueprint (repair pass before Zod). */
export function normalizeGenerationBlueprint(input: unknown): unknown {
  if (!input || typeof input !== "object") return input;
  const src = input as Record<string, unknown>;
  const rawServices = Array.isArray(src.services) ? src.services : [];
  const services = rawServices.map((item, idx) => {
    const s = (item ?? {}) as Record<string, unknown>;
    const displayName = String(s.displayName ?? s.name ?? `Service ${idx + 1}`).slice(0, 80);
    let name = slugify(String(s.name ?? displayName)) || `service-${idx + 1}`;
    if (name.length < 2) name = `service-${idx + 1}`;
    const layerRaw = String(s.layer ?? "services").toLowerCase();
    const layer: Layer = LAYERS.has(layerRaw) ? (layerRaw as Layer) : "services";
    const rationale = padMin(
      String(s.rationale ?? `Architecture component ${displayName}`),
      12,
      `Component ${displayName}`,
    ).slice(0, 500);
    const lineageRaw = (s.lineage ?? {}) as Record<string, unknown>;
    const lineage = {
      ...defaultLineage(displayName, rationale),
      requirementLabel: padMin(
        String(lineageRaw.requirementLabel ?? displayName),
        8,
        "Requirement",
      ).slice(0, 120),
      requirementDetail: padMin(
        String(lineageRaw.requirementDetail ?? rationale),
        8,
        "Requirement detail",
      ).slice(0, 400),
      constraintLabel: String(lineageRaw.constraintLabel ?? "Operational constraint").slice(0, 80),
      constraintDetail: padMin(
        String(lineageRaw.constraintDetail ?? rationale),
        8,
        "Constraint detail",
      ).slice(0, 300),
      traceSummary: padMin(String(lineageRaw.traceSummary ?? rationale), 12, "Decision trace").slice(
        0,
        300,
      ),
      linkedQuestionIndex:
        typeof lineageRaw.linkedQuestionIndex === "number"
          ? Math.min(2, Math.max(0, lineageRaw.linkedQuestionIndex))
          : idx % 3,
      rejectedAlternatives: Array.isArray(lineageRaw.rejectedAlternatives)
        ? lineageRaw.rejectedAlternatives
        : [],
      assumptions: Array.isArray(lineageRaw.assumptions) ? lineageRaw.assumptions : [],
    };
    return { name, displayName, layer, rationale, lineage };
  });

  while (services.length < 6) {
    const i = services.length;
    services.push({
      name: `service-${i + 1}`,
      displayName: `Service ${i + 1}`,
      layer: i % 2 === 0 ? "services" : "cache",
      rationale: "Additional component inferred for a viable architecture graph",
      lineage: defaultLineage(`Service ${i + 1}`, "Inferred service node"),
    });
  }

  const names = new Set(services.map((s) => s.name));
  const rawConnections = Array.isArray(src.connections) ? src.connections : [];
  const connections = rawConnections
    .map((c) => {
      const r = (c ?? {}) as Record<string, unknown>;
      const fromService = slugify(
        String(r.fromService ?? r.from ?? ""),
      );
      const toService = slugify(String(r.toService ?? r.to ?? ""));
      if (!fromService || !toService || !names.has(fromService) || !names.has(toService)) {
        return null;
      }
      const protocolRaw = String(r.protocol ?? "REST");
      const protocolNorm =
        protocolRaw.toLowerCase() === "internal" ? "internal" : protocolRaw.toUpperCase();
      const protocol: Protocol = PROTOCOLS.has(protocolNorm) ? (protocolNorm as Protocol) : "REST";
      const authRaw = String(r.authMethod ?? "JWT");
      const authMethod: AuthMethod = AUTH.has(authRaw) ? (authRaw as AuthMethod) : "JWT";
      return { fromService, toService, protocol, authMethod };
    })
    .filter((c): c is NonNullable<typeof c> => c != null);

  if (connections.length < 2 && services.length >= 2) {
    connections.push({
      fromService: services[0]!.name,
      toService: services[1]!.name,
      protocol: "REST",
      authMethod: "JWT",
    });
  }

  return ensureLayerCoverage({ services: services.slice(0, 12), connections });
}
