import { REDIS_KEYS } from "@architectai/config";
import type { VerificationStreamEvent } from "@architectai/shared";
import type { Redis } from "ioredis";

export type VerifyJobStatus = "running" | "complete" | "failed";

export interface VerifyStreamSnapshot {
  runId: string;
  architectureId: string;
  events: VerificationStreamEvent[];
  seq: number;
  status: VerifyJobStatus;
  failedReason?: string;
}

export interface VerificationStreamHub {
  init(runId: string, architectureId: string): Promise<void>;
  publish(runId: string, event: VerificationStreamEvent): Promise<number>;
  getSnapshot(runId: string): Promise<VerifyStreamSnapshot | null>;
  setStatus(runId: string, status: VerifyJobStatus, failedReason?: string): Promise<void>;
  waitForEvent(runId: string, afterSeq: number, signal?: AbortSignal): Promise<VerifyStreamSnapshot>;
}

export class InMemoryVerificationStreamHub implements VerificationStreamHub {
  private readonly snapshots = new Map<string, VerifyStreamSnapshot>();
  private readonly waiters = new Map<string, Set<() => void>>();

  async init(runId: string, architectureId: string): Promise<void> {
    this.snapshots.set(runId, {
      runId,
      architectureId,
      events: [],
      seq: 0,
      status: "running",
    });
  }

  async publish(runId: string, event: VerificationStreamEvent): Promise<number> {
    const snap = this.snapshots.get(runId);
    if (!snap) throw new Error(`Unknown verification stream: ${runId}`);
    snap.seq += 1;
    snap.events.push(event);
    if (event.type === "verification.complete") snap.status = "complete";
    if (event.type === "verification.error") snap.status = "failed";
    this.notify(runId);
    return snap.seq;
  }

  async getSnapshot(runId: string): Promise<VerifyStreamSnapshot | null> {
    const snap = this.snapshots.get(runId);
    return snap ? { ...snap, events: [...snap.events] } : null;
  }

  async setStatus(runId: string, status: VerifyJobStatus, failedReason?: string): Promise<void> {
    const snap = this.snapshots.get(runId);
    if (!snap) return;
    snap.status = status;
    if (failedReason) snap.failedReason = failedReason;
    this.notify(runId);
  }

  async waitForEvent(runId: string, afterSeq: number, signal?: AbortSignal): Promise<VerifyStreamSnapshot> {
    const read = () => {
      const snap = this.snapshots.get(runId);
      if (!snap) throw new Error(`Unknown verification stream: ${runId}`);
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
        this.waiters.get(runId)?.delete(onNotify);
      };
      if (signal?.aborted) return onAbort();
      signal?.addEventListener("abort", onAbort);
      if (!this.waiters.has(runId)) this.waiters.set(runId, new Set());
      this.waiters.get(runId)!.add(onNotify);
    });
  }

  private notify(runId: string): void {
    for (const fn of this.waiters.get(runId) ?? []) fn();
  }
}

export class RedisVerificationStreamHub implements VerificationStreamHub {
  constructor(private readonly redis: Redis) {}

  private key(runId: string): string {
    return REDIS_KEYS.verifyState(runId);
  }

  async init(runId: string, architectureId: string): Promise<void> {
    const snap: VerifyStreamSnapshot = {
      runId,
      architectureId,
      events: [],
      seq: 0,
      status: "running",
    };
    await this.redis.set(this.key(runId), JSON.stringify(snap), "EX", 3600);
  }

  private async read(runId: string): Promise<VerifyStreamSnapshot | null> {
    const raw = await this.redis.get(this.key(runId));
    if (!raw) return null;
    return JSON.parse(raw) as VerifyStreamSnapshot;
  }

  private async write(snap: VerifyStreamSnapshot): Promise<void> {
    await this.redis.set(this.key(snap.runId), JSON.stringify(snap), "EX", 3600);
    await this.redis.publish(REDIS_KEYS.verifyStream(snap.runId), String(snap.seq));
  }

  async publish(runId: string, event: VerificationStreamEvent): Promise<number> {
    const snap = await this.read(runId);
    if (!snap) throw new Error(`Unknown verification stream: ${runId}`);
    snap.seq += 1;
    snap.events.push(event);
    if (event.type === "verification.complete") snap.status = "complete";
    if (event.type === "verification.error") snap.status = "failed";
    await this.write(snap);
    return snap.seq;
  }

  async getSnapshot(runId: string): Promise<VerifyStreamSnapshot | null> {
    return this.read(runId);
  }

  async setStatus(runId: string, status: VerifyJobStatus, failedReason?: string): Promise<void> {
    const snap = await this.read(runId);
    if (!snap) return;
    snap.status = status;
    if (failedReason) snap.failedReason = failedReason;
    await this.write(snap);
  }

  async waitForEvent(runId: string, afterSeq: number, signal?: AbortSignal): Promise<VerifyStreamSnapshot> {
    const sub = this.redis.duplicate();
    await sub.subscribe(REDIS_KEYS.verifyStream(runId));

    return new Promise((resolve, reject) => {
      const done = async () => {
        await sub.unsubscribe();
        await sub.quit();
      };
      const check = async () => {
        const snap = await this.read(runId);
        if (!snap) {
          await done();
          reject(new Error(`Unknown verification stream: ${runId}`));
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
