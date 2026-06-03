import type { CursorWsMessage, DriftEvent } from "@architectai/shared";

export interface DriftHubSubscriber {
  workspaceId: string;
  push(message: CursorWsMessage): void;
}

/** In-memory WS bridge for tests and single-node dev (P5-IT-01, P5-PERF-02, P6-IT-04). */
export class InMemoryDriftHub {
  private readonly subs = new Map<string, Set<DriftHubSubscriber>>();
  private readonly archSubs = new Map<string, Set<DriftHubSubscriber>>();

  subscribe(workspaceId: string, sub: DriftHubSubscriber): () => void {
    let set = this.subs.get(workspaceId);
    if (!set) {
      set = new Set();
      this.subs.set(workspaceId, set);
    }
    set.add(sub);
    return () => set!.delete(sub);
  }

  publish(workspaceId: string, message: CursorWsMessage): void {
    const set = this.subs.get(workspaceId);
    if (!set) return;
    for (const s of set) s.push(message);
  }

  subscribeArchitecture(architectureId: string, sub: DriftHubSubscriber): () => void {
    let set = this.archSubs.get(architectureId);
    if (!set) {
      set = new Set();
      this.archSubs.set(architectureId, set);
    }
    set.add(sub);
    return () => set!.delete(sub);
  }

  publishForArchitecture(architectureId: string, message: CursorWsMessage): void {
    const set = this.archSubs.get(architectureId);
    if (!set) return;
    for (const s of set) s.push(message);
  }

  async waitForArchitectureUpdated(
    architectureId: string,
    timeoutMs = 500,
  ): Promise<{ architectureId: string; version: number } | null> {
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        unsub();
        resolve(null);
      }, timeoutMs);
      const unsub = this.subscribeArchitecture(architectureId, {
        workspaceId: architectureId,
        push: (msg) => {
          if (msg.type === "architecture.updated") {
            clearTimeout(timer);
            unsub();
            resolve(msg.payload);
          }
        },
      });
    });
  }

  async waitForDetected(
    workspaceId: string,
    timeoutMs = 500,
  ): Promise<DriftEvent | null> {
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        unsub();
        resolve(null);
      }, timeoutMs);
      const unsub = this.subscribe(workspaceId, {
        workspaceId,
        push: (msg) => {
          if (msg.type === "drift.detected") {
            clearTimeout(timer);
            unsub();
            resolve(msg.payload);
          }
        },
      });
    });
  }
}
