import { REDIS_KEYS } from "@architectai/config";
import type { Redis } from "ioredis";
import type { RequestHandler } from "express";
import { ApiError } from "@/lib/errors";

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  limit: number;
  resetMs: number;
}

/** Storage backend for fixed-window counters. */
export interface RateLimitStore {
  hit(key: string, windowMs: number, limit: number): Promise<RateLimitResult>;
}

/**
 * In-memory fixed-window store. Default for dev/tests/single-instance. Not shared
 * across processes — use {@link RedisRateLimitStore} in production.
 */
export class InMemoryRateLimitStore implements RateLimitStore {
  private readonly buckets = new Map<string, { count: number; expiresAt: number }>();

  async hit(key: string, windowMs: number, limit: number): Promise<RateLimitResult> {
    const now = Date.now();
    const bucketKey = `${key}:${Math.floor(now / windowMs)}`;
    const existing = this.buckets.get(bucketKey);
    let entry = existing;
    if (!entry || entry.expiresAt <= now) {
      entry = { count: 0, expiresAt: now + windowMs };
      this.buckets.set(bucketKey, entry);
      this.sweep(now);
    }
    entry.count += 1;
    return {
      allowed: entry.count <= limit,
      remaining: Math.max(0, limit - entry.count),
      limit,
      resetMs: entry.expiresAt - now,
    };
  }

  private sweep(now: number): void {
    if (this.buckets.size < 1024) return;
    for (const [k, v] of this.buckets) if (v.expiresAt <= now) this.buckets.delete(k);
  }
}

/** Redis-backed fixed-window store (atomic INCR + PEXPIRE). For multi-instance prod. */
export class RedisRateLimitStore implements RateLimitStore {
  constructor(private readonly redis: Redis) {}

  async hit(key: string, windowMs: number, limit: number): Promise<RateLimitResult> {
    const bucket = Math.floor(Date.now() / windowMs);
    const redisKey = `${key}:${bucket}`;
    const count = await this.redis.incr(redisKey);
    if (count === 1) await this.redis.pexpire(redisKey, windowMs);
    const ttl = await this.redis.pttl(redisKey);
    return {
      allowed: count <= limit,
      remaining: Math.max(0, limit - count),
      limit,
      resetMs: ttl >= 0 ? ttl : windowMs,
    };
  }
}

export interface RateLimitOptions {
  store: RateLimitStore;
  limit: number;
  windowMs?: number;
  /** Logical scope (e.g. "default", "generate", "drift") for the Redis key space. */
  scope: string;
  /** Derives the per-caller id. Defaults to user id, falling back to client IP. */
  keyFn?: (req: Parameters<RequestHandler>[0]) => string;
}

const MINUTE_MS = 60_000;

export function rateLimit(opts: RateLimitOptions): RequestHandler {
  const windowMs = opts.windowMs ?? MINUTE_MS;
  const keyFn =
    opts.keyFn ?? ((req) => req.auth?.userId ?? req.ip ?? req.socket.remoteAddress ?? "anonymous");

  return (req, res, next) => {
    void opts.store
      .hit(REDIS_KEYS.rateLimit(opts.scope, keyFn(req)), windowMs, opts.limit)
      .then((result) => {
        res.setHeader("X-RateLimit-Limit", String(result.limit));
        res.setHeader("X-RateLimit-Remaining", String(result.remaining));
        res.setHeader("X-RateLimit-Reset", String(Math.ceil(result.resetMs / 1000)));
        if (!result.allowed) {
          res.setHeader("Retry-After", String(Math.ceil(result.resetMs / 1000)));
          throw ApiError.rateLimited();
        }
        next();
      })
      .catch(next);
  };
}
