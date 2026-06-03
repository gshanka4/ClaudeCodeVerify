import { REDIS_KEYS } from "@architectai/config";
import type { GenerationStreamEvent } from "@architectai/shared";
import type { Redis } from "ioredis";

export type GenJobStatus = "running" | "complete" | "cancelled" | "failed";

export interface GenStreamSnapshot {
  architectureId: string;
  events: GenerationStreamEvent[];
  seq: number;
  status: GenJobStatus;
  cancelRequested: boolean;
  failedReason?: string;
}

export interface GenerationStreamHub {
  init(architectureId: string): Promise<void>;
  publish(architectureId: string, event: GenerationStreamEvent): Promise<number>;
  getSnapshot(architectureId: string): Promise<GenStreamSnapshot | null>;
  requestCancel(architectureId: string): Promise<boolean>;
  isCancelRequested(architectureId: string): Promise<boolean>;
  setStatus(architectureId: string, status: GenJobStatus, failedReason?: string): Promise<void>;
  waitForEvent(architectureId: string, afterSeq: number, signal?: AbortSignal): Promise<GenStreamSnapshot>;
}

/** In-process hub for tests and single-instance dev (P3-EC-03 reconnect). */
export class InMemoryGenerationStreamHub implements GenerationStreamHub {
  private readonly snapshots = new Map<string, GenStreamSnapshot>();
  private readonly waiters = new Map<string, Set<() => void>>();

  async init(architectureId: string): Promise<void> {
    this.snapshots.set(architectureId, {
      architectureId,
      events: [],
      seq: 0,
      status: "running",
      cancelRequested: false,
    });
  }

  async publish(architectureId: string, event: GenerationStreamEvent): Promise<number> {
    const snap = this.snapshots.get(architectureId);
    if (!snap) throw new Error(`Unknown generation stream: ${architectureId}`);
    snap.seq += 1;
    snap.events.push(event);
    if (event.type === "complete") snap.status = "complete";
    if (event.type === "error") snap.status = "failed";
    this.notify(architectureId);
    return snap.seq;
  }

  async getSnapshot(architectureId: string): Promise<GenStreamSnapshot | null> {
    const snap = this.snapshots.get(architectureId);
    return snap ? { ...snap, events: [...snap.events] } : null;
  }

  async requestCancel(architectureId: string): Promise<boolean> {
    const snap = this.snapshots.get(architectureId);
    if (!snap || snap.status !== "running") return false;
    snap.cancelRequested = true;
    this.notify(architectureId);
    return true;
  }

  async isCancelRequested(architectureId: string): Promise<boolean> {
    return this.snapshots.get(architectureId)?.cancelRequested ?? false;
  }

  async setStatus(architectureId: string, status: GenJobStatus, failedReason?: string): Promise<void> {
    const snap = this.snapshots.get(architectureId);
    if (!snap) return;
    snap.status = status;
    if (failedReason) snap.failedReason = failedReason;
    this.notify(architectureId);
  }

  async waitForEvent(architectureId: string, afterSeq: number, signal?: AbortSignal): Promise<GenStreamSnapshot> {
    const read = () => {
      const snap = this.snapshots.get(architectureId);
      if (!snap) throw new Error(`Unknown generation stream: ${architectureId}`);
      return { ...snap, events: [...snap.events] };
    };

    let snap = read();
    if (snap.seq > afterSeq || snap.status !== "running") return snap;

    return new Promise((resolve, reject) => {
      const onAbort = () => {
        cleanup();
        reject(new Error("aborted"));
      };
      const onNotify = () => {
        snap = read();
        if (snap.seq > afterSeq || snap.status !== "running") {
          cleanup();
          resolve(snap);
        }
      };
      const cleanup = () => {
        signal?.removeEventListener("abort", onAbort);
        this.waiters.get(architectureId)?.delete(onNotify);
      };
      if (signal?.aborted) return onAbort();
      signal?.addEventListener("abort", onAbort);
      if (!this.waiters.has(architectureId)) this.waiters.set(architectureId, new Set());
      this.waiters.get(architectureId)!.add(onNotify);
    });
  }

  private notify(architectureId: string): void {
    for (const fn of this.waiters.get(architectureId) ?? []) fn();
  }
}

/** Redis-backed snapshot for cross-replica SSE (P3-EC-04). */
export class RedisGenerationStreamHub implements GenerationStreamHub {
  constructor(private readonly redis: Redis) {}

  private key(architectureId: string): string {
    return REDIS_KEYS.genState(architectureId);
  }

  async init(architectureId: string): Promise<void> {
    const snap: GenStreamSnapshot = {
      architectureId,
      events: [],
      seq: 0,
      status: "running",
      cancelRequested: false,
    };
    await this.redis.set(this.key(architectureId), JSON.stringify(snap), "EX", 3600);
  }

  private async read(architectureId: string): Promise<GenStreamSnapshot | null> {
    const raw = await this.redis.get(this.key(architectureId));
    if (!raw) return null;
    return JSON.parse(raw) as GenStreamSnapshot;
  }

  private async write(snap: GenStreamSnapshot): Promise<void> {
    await this.redis.set(this.key(snap.architectureId), JSON.stringify(snap), "EX", 3600);
    await this.redis.publish(REDIS_KEYS.genStream(snap.architectureId), String(snap.seq));
  }

  async publish(architectureId: string, event: GenerationStreamEvent): Promise<number> {
    const snap = await this.read(architectureId);
    if (!snap) throw new Error(`Unknown generation stream: ${architectureId}`);
    snap.seq += 1;
    snap.events.push(event);
    if (event.type === "complete") snap.status = "complete";
    if (event.type === "error") snap.status = "failed";
    await this.write(snap);
    return snap.seq;
  }

  async getSnapshot(architectureId: string): Promise<GenStreamSnapshot | null> {
    return this.read(architectureId);
  }

  async requestCancel(architectureId: string): Promise<boolean> {
    const snap = await this.read(architectureId);
    if (!snap || snap.status !== "running") return false;
    snap.cancelRequested = true;
    await this.write(snap);
    return true;
  }

  async isCancelRequested(architectureId: string): Promise<boolean> {
    return (await this.read(architectureId))?.cancelRequested ?? false;
  }

  async setStatus(architectureId: string, status: GenJobStatus, failedReason?: string): Promise<void> {
    const snap = await this.read(architectureId);
    if (!snap) return;
    snap.status = status;
    if (failedReason) snap.failedReason = failedReason;
    await this.write(snap);
  }

  async waitForEvent(architectureId: string, afterSeq: number, signal?: AbortSignal): Promise<GenStreamSnapshot> {
    const sub = this.redis.duplicate();
    await sub.subscribe(REDIS_KEYS.genStream(architectureId));

    return new Promise((resolve, reject) => {
      const done = async () => {
        await sub.unsubscribe();
        await sub.quit();
      };
      const check = async () => {
        const snap = await this.read(architectureId);
        if (!snap) {
          await done();
          reject(new Error(`Unknown generation stream: ${architectureId}`));
          return;
        }
        if (snap.seq > afterSeq || snap.status !== "running") {
          await done();
          resolve(snap);
        }
      };
      void check();
      sub.on("message", () => void check());
      signal?.addEventListener("abort", () => {
        void done().then(() => reject(new Error("aborted")));
      });
    });
  }
}
