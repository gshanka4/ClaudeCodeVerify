import { Queue, Worker, type ConnectionOptions, type Processor } from "bullmq";

/**
 * Background job queues. Processors are implemented in later phases (generation,
 * drift fan-out, notifications); Phase 1 only wires the factory + names so the
 * topology is fixed and discoverable.
 */
export const QUEUE_NAMES = {
  generation: "generation",
  drift: "drift",
  notifications: "notifications",
  lineage: "lineage",
} as const;

export type QueueName = (typeof QUEUE_NAMES)[keyof typeof QUEUE_NAMES];

export function createQueue(name: QueueName, connection: ConnectionOptions): Queue {
  return new Queue(name, { connection, defaultJobOptions: { attempts: 3, backoff: { type: "exponential", delay: 1000 } } });
}

export function createWorker<T = unknown>(
  name: QueueName,
  processor: Processor<T>,
  connection: ConnectionOptions,
): Worker<T> {
  return new Worker<T>(name, processor, { connection });
}
