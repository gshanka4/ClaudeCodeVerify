import type { ConnectionOptions, Job, Worker } from "bullmq";
import { logger } from "@/lib/logger";
import { createWorker, QUEUE_NAMES, type QueueName } from "@/workers/queue";

/**
 * Placeholder processor. Each queue gets a real implementation in its phase
 * (generation → Phase 3, drift → Phase 4, …). Until then we register no-op
 * workers so jobs aren't silently lost and the wiring is observable.
 */
async function notImplemented(job: Job): Promise<void> {
  logger.warn({ queue: job.queueName, jobId: job.id }, "Processor not implemented yet — job ignored");
}

/** Register all background workers against a Redis connection. */
export function registerWorkers(connection: ConnectionOptions): Worker[] {
  return (Object.values(QUEUE_NAMES) as QueueName[]).map((name) =>
    createWorker(name, notImplemented, connection),
  );
}

export { QUEUE_NAMES, createQueue, createWorker } from "@/workers/queue";
export type { QueueName } from "@/workers/queue";
