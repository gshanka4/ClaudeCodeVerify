import type { GovernanceRule } from "@architectai/shared";

export interface IndexedRules {
  architectureId: string;
  version: number;
  rules: GovernanceRule[];
  warmedAt: number;
}

/** In-memory rule index keyed by architecture + version (P5-EC-07 invalidation). */
export class RuleIndex {
  private readonly index = new Map<string, IndexedRules>();

  private key(architectureId: string, version: number): string {
    return `${architectureId}:v${version}`;
  }

  warm(architectureId: string, version: number, rules: GovernanceRule[]): void {
    this.index.set(this.key(architectureId, version), {
      architectureId,
      version,
      rules: rules.filter((r) => r.enabled),
      warmedAt: Date.now(),
    });
  }

  get(architectureId: string, version: number): GovernanceRule[] | null {
    return this.index.get(this.key(architectureId, version))?.rules ?? null;
  }

  invalidate(architectureId: string): void {
    for (const k of this.index.keys()) {
      if (k.startsWith(`${architectureId}:`)) this.index.delete(k);
    }
  }
}
