import type { Tier1FindingDraft, VerificationContext } from "@/verification/types";

/** Validates contracts compose and required interfaces are present. */
export function checkStructureComposition(ctx: VerificationContext): Tier1FindingDraft[] {
  if (ctx.services.length === 0) {
    return [
      {
        architectureId: ctx.architectureId,
        check: "structure.composition",
        tier: "deterministic",
        verdict: "verified",
        confidence: 1,
        groundTruthSource: { kind: "capability-table", ref: "empty" },
        detail: "No services — composition trivially satisfied",
      },
    ];
  }

  const findings: Tier1FindingDraft[] = [];

  for (const conn of ctx.connections) {
    if (!conn.isContractDefined && !conn.contractId) {
      const fromSvc = ctx.services.find((s) => s.id === conn.fromServiceId);
      findings.push({
        architectureId: ctx.architectureId,
        serviceId: conn.fromServiceId,
        check: "structure.composition",
        tier: "deterministic",
        verdict: "conflict",
        confidence: 1,
        groundTruthSource: { kind: "capability-table", ref: conn.id },
        detail: `Missing required interface on connection from ${fromSvc?.name ?? conn.fromServiceId}`,
        evidenceRef: conn.id,
      });
    }
  }

  for (const trace of ctx.lineage.traces) {
    if (trace.contractNodeIds.length === 0) {
      const svc = ctx.services.find((s) => s.id === trace.serviceId);
      findings.push({
        architectureId: ctx.architectureId,
        serviceId: trace.serviceId,
        check: "structure.composition",
        tier: "deterministic",
        verdict: "conflict",
        confidence: 1,
        groundTruthSource: { kind: "capability-table", ref: trace.serviceId },
        detail: `Service "${svc?.name ?? trace.serviceId}" missing contract in lineage`,
      });
    }
  }

  if (findings.length === 0) {
    findings.push({
      architectureId: ctx.architectureId,
      check: "structure.composition",
      tier: "deterministic",
      verdict: "verified",
      confidence: 1,
      groundTruthSource: { kind: "capability-table", ref: "all-composed" },
      detail: "All contracts compose; interfaces present on every connection",
    });
  }

  return findings;
}

function detectCycle(adjacency: Map<string, string[]>): string[] | null {
  const visited = new Set<string>();
  const stack = new Set<string>();
  const path: string[] = [];

  function dfs(node: string): string[] | null {
    visited.add(node);
    stack.add(node);
    path.push(node);

    for (const next of adjacency.get(node) ?? []) {
      if (!visited.has(next)) {
        const cycle = dfs(next);
        if (cycle) return cycle;
      } else if (stack.has(next)) {
        const start = path.indexOf(next);
        return path.slice(start).concat(next);
      }
    }

    path.pop();
    stack.delete(node);
    return null;
  }

  for (const node of adjacency.keys()) {
    if (!visited.has(node)) {
      const cycle = dfs(node);
      if (cycle) return cycle;
    }
  }
  return null;
}

/** Validates dependency graph is acyclic and connected where expected. */
export function checkStructureIntegrity(ctx: VerificationContext): Tier1FindingDraft[] {
  if (ctx.connections.length === 0) {
    if (ctx.services.length <= 1) {
      return [
        {
          architectureId: ctx.architectureId,
          check: "structure.integrity",
          tier: "deterministic",
          verdict: "verified",
          confidence: 1,
          groundTruthSource: { kind: "capability-table", ref: "no-edges" },
          detail: "No connections — graph trivially acyclic",
        },
      ];
    }

    return [
      {
        architectureId: ctx.architectureId,
        check: "structure.integrity",
        tier: "deterministic",
        verdict: "unverified",
        confidence: 1,
        groundTruthSource: { kind: "capability-table", ref: "isolated-services" },
        detail: `${ctx.services.length} services with no connections — orphan topology flagged`,
      },
    ];
  }

  const adjacency = new Map<string, string[]>();
  const connected = new Set<string>();

  for (const conn of ctx.connections) {
    const list = adjacency.get(conn.fromServiceId) ?? [];
    list.push(conn.toServiceId);
    adjacency.set(conn.fromServiceId, list);
    connected.add(conn.fromServiceId);
    connected.add(conn.toServiceId);
  }

  const cycle = detectCycle(adjacency);
  if (cycle) {
    const names = cycle.map((id) => ctx.services.find((s) => s.id === id)?.name ?? id);
    return [
      {
        architectureId: ctx.architectureId,
        check: "structure.integrity",
        tier: "deterministic",
        verdict: "conflict",
        confidence: 1,
        groundTruthSource: { kind: "capability-table", ref: "cycle" },
        detail: `Dependency cycle detected: ${names.join(" → ")}`,
        evidenceRef: cycle.join(","),
      },
    ];
  }

  const orphans = ctx.services.filter((s) => !connected.has(s.id));
  if (orphans.length > 0) {
    return [
      {
        architectureId: ctx.architectureId,
        check: "structure.integrity",
        tier: "deterministic",
        verdict: "unverified",
        confidence: 1,
        groundTruthSource: { kind: "capability-table", ref: "orphans" },
        detail: `${orphans.length} isolated service(s): ${orphans.map((s) => s.name).join(", ")}`,
      },
    ];
  }

  return [
    {
      architectureId: ctx.architectureId,
      check: "structure.integrity",
      tier: "deterministic",
      verdict: "verified",
      confidence: 1,
      groundTruthSource: { kind: "capability-table", ref: "acyclic-connected" },
      detail: "Dependency graph is acyclic and connected",
    },
  ];
}
