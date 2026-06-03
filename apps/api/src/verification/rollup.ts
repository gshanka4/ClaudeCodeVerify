import type { ComponentVerdictRollup, VerificationVerdict } from "@architectai/shared";

const VERDICT_RANK: Record<VerificationVerdict, number> = {
  conflict: 0,
  unverified: 1,
  verified: 2,
};

export function worstVerdict(verdicts: VerificationVerdict[]): VerificationVerdict {
  if (verdicts.length === 0) return "verified";
  return verdicts.reduce((worst, v) =>
    VERDICT_RANK[v] < VERDICT_RANK[worst] ? v : worst,
  );
}

type RollupFinding = { id: string; serviceId?: string; verdict: VerificationVerdict };

/** Roll up per-service findings — conflict beats unverified beats verified. */
export function rollupComponentVerdicts(findings: RollupFinding[]): ComponentVerdictRollup[] {
  const byService = new Map<string, RollupFinding[]>();

  for (const finding of findings) {
    if (!finding.serviceId) continue;
    const list = byService.get(finding.serviceId) ?? [];
    list.push(finding);
    byService.set(finding.serviceId, list);
  }

  return [...byService.entries()].map(([serviceId, serviceFindings]) => ({
    serviceId,
    verdict: worstVerdict(serviceFindings.map((f) => f.verdict)),
    findingIds: serviceFindings.map((f) => f.id),
  }));
}

export function rollupArchitectureVerdict(findings: RollupFinding[]): VerificationVerdict {
  return worstVerdict(findings.map((f) => f.verdict));
}
