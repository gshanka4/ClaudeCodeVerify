import { resolveSource } from "@/generation/lineage-integrity";
import type { Tier1FindingDraft, VerificationContext } from "@/verification/types";

function archFinding(
  ctx: VerificationContext,
  verdict: Tier1FindingDraft["verdict"],
  detail: string,
  ref = "architecture",
): Tier1FindingDraft {
  return {
    architectureId: ctx.architectureId,
    check: "coverage.requirement",
    tier: "deterministic",
    verdict,
    confidence: 1,
    groundTruthSource: { kind: "requirement", ref },
    detail,
  };
}

/** Maps interrogation answers to ≥1 component. */
export function checkCoverageRequirement(ctx: VerificationContext): Tier1FindingDraft[] {
  if (!ctx.hasInterrogationSession) {
    return [
      archFinding(
        ctx,
        "unverified",
        "No interrogation session — requirement coverage cannot be verified",
      ),
    ];
  }

  if (ctx.services.length === 0) {
    return [
      archFinding(
        ctx,
        "unverified",
        "No services present — requirement coverage cannot be assessed",
      ),
    ];
  }

  if (ctx.requirements.length === 0) {
    return [
      archFinding(ctx, "unverified", "No interrogation answers recorded for coverage mapping"),
    ];
  }

  const mappedQuestions = new Set<string>();
  for (const trace of ctx.lineage.traces) {
    for (const reqNodeId of trace.requirementNodeIds) {
      const node = ctx.lineage.nodes.find((n) => n.id === reqNodeId);
      if (node?.source?.kind === "interrogation") {
        mappedQuestions.add(node.source.ref);
      }
    }
  }

  const findings: Tier1FindingDraft[] = [];
  for (const req of ctx.requirements) {
    if (!mappedQuestions.has(req.questionId)) {
      findings.push({
        architectureId: ctx.architectureId,
        check: "coverage.requirement",
        tier: "deterministic",
        verdict: "conflict",
        confidence: 1,
        groundTruthSource: { kind: "requirement", ref: req.questionId },
        detail: `Orphan requirement: "${req.label}" maps to no component`,
      });
    }
  }

  if (findings.length === 0) {
    findings.push({
      architectureId: ctx.architectureId,
      check: "coverage.requirement",
      tier: "deterministic",
      verdict: "verified",
      confidence: 1,
      groundTruthSource: { kind: "requirement", ref: "all-mapped" },
      detail: "Every interrogation answer maps to at least one component",
    });
  }

  return findings;
}

/** Every service must trace back to a requirement via lineage. */
export function checkCoverageJustification(ctx: VerificationContext): Tier1FindingDraft[] {
  if (!ctx.hasInterrogationSession) {
    return [
      {
        architectureId: ctx.architectureId,
        check: "coverage.justification",
        tier: "deterministic",
        verdict: "unverified",
        confidence: 1,
        groundTruthSource: { kind: "requirement", ref: "no-session" },
        detail: "No interrogation session — service justification cannot be verified",
      },
    ];
  }

  if (ctx.services.length === 0) {
    return [
      {
        architectureId: ctx.architectureId,
        check: "coverage.justification",
        tier: "deterministic",
        verdict: "unverified",
        confidence: 1,
        groundTruthSource: { kind: "requirement", ref: "no-services" },
        detail: "No services present — justification check not applicable",
      },
    ];
  }

  const findings: Tier1FindingDraft[] = [];

  for (const svc of ctx.services) {
    const trace = ctx.lineage.traces.find((t) => t.serviceId === svc.id);
    if (!trace || trace.requirementNodeIds.length === 0) {
      findings.push({
        architectureId: ctx.architectureId,
        serviceId: svc.id,
        check: "coverage.justification",
        tier: "deterministic",
        verdict: "conflict",
        confidence: 1,
        groundTruthSource: { kind: "requirement", ref: svc.id },
        detail: `Service "${svc.name}" has no requirement justification chain`,
      });
      continue;
    }

    const unresolved = trace.requirementNodeIds.some((nodeId) => {
      const node = ctx.lineage.nodes.find((n) => n.id === nodeId);
      return node?.source && !resolveSource(node.source, ctx.referentialContext);
    });

    if (unresolved) {
      findings.push({
        architectureId: ctx.architectureId,
        serviceId: svc.id,
        check: "coverage.justification",
        tier: "deterministic",
        verdict: "unverified",
        confidence: 1,
        groundTruthSource: { kind: "requirement", ref: svc.id },
        detail: `Service "${svc.name}" has unresolved requirement provenance`,
      });
    }
  }

  if (findings.length === 0) {
    findings.push({
      architectureId: ctx.architectureId,
      check: "coverage.justification",
      tier: "deterministic",
      verdict: "verified",
      confidence: 1,
      groundTruthSource: { kind: "requirement", ref: "all-justified" },
      detail: "Every service traces to at least one requirement",
    });
  }

  return findings;
}
