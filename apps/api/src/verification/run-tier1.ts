import type { ComponentVerdictRollup, TrustGradeBreakdown } from "@architectai/shared";
import { checkCoverageJustification, checkCoverageRequirement } from "@/verification/checks/coverage";
import { checkGovernanceConformance } from "@/verification/checks/governance";
import { checkStructureComposition, checkStructureIntegrity } from "@/verification/checks/structure";
import { rollupComponentVerdicts, rollupArchitectureVerdict } from "@/verification/rollup";
import { computeTrustGrade } from "@/verification/trust-grade";
import type {
  Tier1Finding,
  Tier1FindingDraft,
  VerificationContext,
} from "@/verification/types";
import { TIER1_ENGINE_VERSION } from "@/verification/types";

export interface Tier1RunOptions {
  /** Optional probabilistic findings (Tier-2) included in Trust Grade only. */
  probabilisticFindings?: Tier1FindingDraft[];
  overrides?: Array<{ findingId: string; reason: string }>;
}

export interface Tier1RunResult {
  findings: Tier1Finding[];
  componentRollups: ComponentVerdictRollup[];
  architectureVerdict: ReturnType<typeof rollupArchitectureVerdict>;
  trustGrade: TrustGradeBreakdown;
  timingMs: number;
  engineVersions: Record<string, string>;
  checksRun: number;
}

function assignIds(drafts: Tier1FindingDraft[]): Tier1Finding[] {
  return drafts.map((d) => ({ ...d, id: crypto.randomUUID() }));
}

/** Run all MVP Tier-1 deterministic checks — no LLM calls. */
export function runTier1(
  ctx: VerificationContext,
  opts: Tier1RunOptions = {},
): Tier1RunResult {
  const started = performance.now();

  const draftFindings: Tier1FindingDraft[] = [
    ...checkCoverageRequirement(ctx),
    ...checkCoverageJustification(ctx),
    ...checkStructureComposition(ctx),
    ...checkStructureIntegrity(ctx),
    ...checkGovernanceConformance(ctx),
    ...(opts.probabilisticFindings ?? []),
  ];

  const findings = assignIds(draftFindings);
  const componentRollups = rollupComponentVerdicts(findings);
  const architectureVerdict = rollupArchitectureVerdict(findings);
  const trustGrade = computeTrustGrade({
    findings,
    services: ctx.services,
    overrides: opts.overrides,
  });

  const timingMs = performance.now() - started;

  return {
    findings,
    componentRollups,
    architectureVerdict,
    trustGrade,
    timingMs,
    engineVersions: { tier1: TIER1_ENGINE_VERSION },
    checksRun: 5,
  };
}

// Re-export engine version constant for tests
export { TIER1_ENGINE_VERSION } from "@/verification/types";
