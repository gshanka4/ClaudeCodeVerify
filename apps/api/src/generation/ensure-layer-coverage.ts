import type { GenerationServiceBlueprint, GeneratedServiceSpec } from "@/ai/schemas/generation-plan";

const REQUIRED_LAYERS = ["gateway", "services", "cache", "database", "security"] as const;

function hasLayer(services: GeneratedServiceSpec[], layer: string): boolean {
  return services.some((s) => s.layer === layer);
}

function mk(
  name: string,
  displayName: string,
  layer: GeneratedServiceSpec["layer"],
  rationale: string,
): GeneratedServiceSpec {
  return {
    name,
    displayName,
    layer,
    rationale,
    lineage: {
      requirementLabel: "Platform baseline",
      requirementDetail: rationale,
      constraintLabel: "Operational constraint",
      constraintDetail: "Injected to satisfy production-like layer coverage",
      traceSummary: `${displayName}: standard ${layer} tier for governed architectures`,
      rejectedAlternatives: [],
      assumptions: ["Managed cloud deployment"],
    },
  };
}

/** Ensures gateway, services, cache, database, and security appear in every blueprint. */
export function ensureLayerCoverage(
  blueprint: GenerationServiceBlueprint,
): GenerationServiceBlueprint {
  const services = [...blueprint.services];
  const names = new Set<string>();
  for (const svc of services) {
    let unique = svc.name;
    let n = 1;
    while (names.has(unique)) {
      unique = `${svc.name}-${n++}`;
    }
    names.add(unique);
    if (unique !== svc.name) {
      (svc as { name: string }).name = unique;
    }
  }

  const add = (spec: GeneratedServiceSpec) => {
    if (names.has(spec.name)) return;
    services.push(spec);
    names.add(spec.name);
  };

  if (!hasLayer(services, "gateway")) {
    add(mk("api-gateway", "API Gateway", "gateway", "North-south ingress and rate limiting"));
  }
  if (services.filter((s) => s.layer === "services").length < 2) {
    add(
      mk(
        "core-service",
        "Core Domain Service",
        "services",
        "Primary business logic orchestrating domain workflows",
      ),
    );
    add(
      mk(
        "integration-service",
        "Integration Service",
        "services",
        "Partner and internal integration adapters",
      ),
    );
  }
  if (!hasLayer(services, "cache")) {
    add(mk("redis-cache", "Redis Cache", "cache", "Hot read path and session/token cache"));
  }
  if (!hasLayer(services, "database")) {
    add(mk("primary-database", "Primary Database", "database", "Authoritative transactional store"));
  }
  if (!hasLayer(services, "security")) {
    add(
      mk("policy-engine", "Policy Engine", "security", "Authentication, authorization, and compliance policies"),
    );
  }
  if (!hasLayer(services, "messaging") && services.length < 8) {
    add(mk("event-bus", "Event Bus", "messaging", "Async domain events and integration fan-out"));
  }

  const serviceNames = new Set(services.map((s) => s.name));
  const connections = blueprint.connections.filter(
    (c) =>
      c.fromService.length >= 2 &&
      c.toService.length >= 2 &&
      serviceNames.has(c.fromService) &&
      serviceNames.has(c.toService),
  );
  const hasConn = (a: string, b: string) =>
    connections.some(
      (c) =>
        (c.fromService === a && c.toService === b) || (c.fromService === b && c.toService === a),
    );

  const gateway = services.find((s) => s.layer === "gateway")?.name ?? "api-gateway";
  const core = services.find((s) => s.layer === "services")?.name ?? "core-service";
  const cache = services.find((s) => s.layer === "cache")?.name;
  const db = services.find((s) => s.layer === "database")?.name;

  if (serviceNames.has(gateway) && serviceNames.has(core) && !hasConn(gateway, core)) {
    connections.push({
      fromService: gateway,
      toService: core,
      protocol: "REST",
      authMethod: "JWT",
    });
  }
  if (cache && serviceNames.has(core) && !hasConn(core, cache)) {
    connections.push({ fromService: core, toService: cache, protocol: "internal", authMethod: "none" });
  }
  if (db && serviceNames.has(core) && !hasConn(core, db)) {
    connections.push({ fromService: core, toService: db, protocol: "gRPC", authMethod: "mTLS" });
  }
  const security = services.find((s) => s.layer === "security")?.name;
  if (security && serviceNames.has(gateway) && !hasConn(gateway, security)) {
    connections.push({ fromService: gateway, toService: security, protocol: "REST", authMethod: "JWT" });
  }
  const messaging = services.find((s) => s.layer === "messaging")?.name;
  if (messaging && cache && serviceNames.has(core) && !hasConn(messaging, db ?? core)) {
    connections.push({
      fromService: messaging,
      toService: db ?? core,
      protocol: "Kafka",
      authMethod: "mTLS",
    });
  }

  while (connections.length < 4 && services.length >= 2) {
    const a = services[connections.length % services.length]!.name;
    const b = services[(connections.length + 1) % services.length]!.name;
    if (!hasConn(a, b)) {
      connections.push({ fromService: a, toService: b, protocol: "REST", authMethod: "JWT" });
    } else {
      break;
    }
  }

  return { services, connections };
}

export function blueprintLayerCoverage(blueprint: GenerationServiceBlueprint): Record<string, boolean> {
  return Object.fromEntries(
    REQUIRED_LAYERS.map((layer) => [layer, hasLayer(blueprint.services, layer)]),
  );
}
