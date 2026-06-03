import type { GovernanceRule, RuleCondition } from "@architectai/shared";
import type { ArchServiceDto, ServiceConnectionDto } from "@/services/architectures.service";

export interface GraphConnection {
  id: string;
  fromServiceId: string;
  toServiceId: string;
  fromName: string;
  toName: string;
  protocol: string;
  authMethod: string;
  isContractDefined: boolean;
  contractId: string | null;
}

export interface ArchitectureGraph {
  services: ArchServiceDto[];
  connections: GraphConnection[];
}

export interface GraphRuleViolation {
  rule: GovernanceRule;
  serviceId?: string;
  connectionId?: string;
  message: string;
}

function serviceName(services: ArchServiceDto[], id: string): string {
  return services.find((s) => s.id === id)?.name ?? id;
}

function nameMatches(serviceName: string, pattern: string): boolean {
  const normalized = serviceName.toLowerCase();
  const pat = pattern.toLowerCase();
  if (pat.includes("*")) {
    const escaped = pat.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*");
    return new RegExp(escaped, "i").test(normalized);
  }
  return normalized === pat || normalized.endsWith(`-${pat}`) || normalized.includes(`-${pat}-`);
}

export function buildArchitectureGraph(
  services: ArchServiceDto[],
  connections: ServiceConnectionDto[],
): ArchitectureGraph {
  return {
    services,
    connections: connections.map((c) => ({
      id: c.id,
      fromServiceId: c.fromServiceId,
      toServiceId: c.toServiceId,
      fromName: serviceName(services, c.fromServiceId),
      toName: serviceName(services, c.toServiceId),
      protocol: c.protocol,
      authMethod: c.authMethod,
      isContractDefined: c.isContractDefined,
      contractId: c.contractId,
    })),
  };
}

function matchContractRule(
  rule: GovernanceRule,
  graph: ArchitectureGraph,
): GraphRuleViolation | null {
  const c = rule.condition as RuleCondition;
  const from = c.forbiddenFrom;
  const to = c.forbiddenTo;
  if (!from || !to) return null;

  for (const conn of graph.connections) {
    if (nameMatches(conn.fromName, from) && nameMatches(conn.toName, to)) {
      return {
        rule,
        serviceId: conn.fromServiceId,
        connectionId: conn.id,
        message: `${conn.fromName} must not access ${conn.toName} directly (${rule.code})`,
      };
    }
  }
  return null;
}

function matchAuthRule(rule: GovernanceRule, graph: ArchitectureGraph): GraphRuleViolation | null {
  const c = rule.condition as RuleCondition;
  if (c.requiredAuth !== "mTLS") return null;

  for (const conn of graph.connections) {
    const fromSvc = graph.services.find((s) => s.id === conn.fromServiceId);
    const toSvc = graph.services.find((s) => s.id === conn.toServiceId);
    const crossBoundary = fromSvc?.layer !== toSvc?.layer;
    if (!crossBoundary) continue;

    const auth = conn.authMethod.toLowerCase();
    if (!auth.includes("mtls") && !auth.includes("m-tls")) {
      return {
        rule,
        serviceId: conn.fromServiceId,
        connectionId: conn.id,
        message: `Cross-boundary connection ${conn.fromName}→${conn.toName} without mTLS (${rule.code})`,
      };
    }
  }
  return null;
}

function matchBoundaryRule(
  rule: GovernanceRule,
  graph: ArchitectureGraph,
): GraphRuleViolation | null {
  const c = rule.condition as RuleCondition;
  if (!c.forbiddenTo?.includes("db")) return null;

  for (const conn of graph.connections) {
    if (nameMatches(conn.toName, c.forbiddenTo)) {
      return {
        rule,
        serviceId: conn.fromServiceId,
        connectionId: conn.id,
        message: `Forbidden boundary: ${conn.fromName}→${conn.toName} (${rule.code})`,
      };
    }
  }
  return null;
}

/** Evaluate enabled governance rules against the architecture connection graph. */
export function evaluateGraphRules(
  graph: ArchitectureGraph,
  rules: GovernanceRule[],
): GraphRuleViolation[] {
  const violations: GraphRuleViolation[] = [];
  for (const rule of rules) {
    if (!rule.enabled) continue;
    let v: GraphRuleViolation | null = null;
    switch (rule.type) {
      case "contract":
        v = matchContractRule(rule, graph);
        break;
      case "auth":
        v = matchAuthRule(rule, graph);
        break;
      case "boundary":
        v = matchBoundaryRule(rule, graph);
        break;
      default:
        break;
    }
    if (v) violations.push(v);
  }
  return violations;
}
