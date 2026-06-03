import type { EvaluateResult } from "./types";

export interface DriftMemoEntry {
  result: EvaluateResult;
  cachedAt: number;
}

/** In-memory hash memo (Redis adapter can wrap the same interface in production). */
export class DriftCheckCache {
  private readonly store = new Map<string, DriftMemoEntry>();

  private key(architectureId: string, version: number, fileHash: string): string {
    return `${architectureId}:v${version}:${fileHash}`;
  }

  get(architectureId: string, version: number, fileHash: string): EvaluateResult | null {
    const hit = this.store.get(this.key(architectureId, version, fileHash));
    return hit?.result ?? null;
  }

  set(architectureId: string, version: number, fileHash: string, result: EvaluateResult): void {
    this.store.set(this.key(architectureId, version, fileHash), {
      result,
      cachedAt: Date.now(),
    });
  }

  invalidateArchitecture(architectureId: string): void {
    for (const k of this.store.keys()) {
      if (k.startsWith(`${architectureId}:`)) this.store.delete(k);
    }
  }
}
