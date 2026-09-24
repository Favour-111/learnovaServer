import { Queue, Worker, Processor } from "bullmq";
import Redis from "ioredis";
import { env } from "../config/env";
import { logger } from "../config/logger";

// Same Redis-optional philosophy as services/cache.ts: with no REDIS_URL,
// every export here is a safe no-op and every call site below falls back to
// today's exact in-process behavior. A separate connection from cache.ts's
// on purpose  BullMQ specifically requires maxRetriesPerRequest: null
// (its blocking commands need to wait rather than fail fast the way a
// cache lookup should), which would be the wrong setting for cache.ts's
// connection.
let connection: Redis | null = null;

if (env.redisUrl) {
  try {
    // Same reasoning as services/cache.ts: `new Redis(url)` throws
    // synchronously for a malformed URL, which must degrade to "jobs
    // disabled" rather than crash the process at import time.
    connection = new Redis(env.redisUrl, {
      maxRetriesPerRequest: null,
      retryStrategy: (times) => Math.min(times * 200, 5000),
    });
    connection.on("error", (err) => {
      logger.warn({ err: err.message }, "[queue] redis error");
    });
  } catch (err) {
    logger.warn({ err }, "[queue] REDIS_URL is set but invalid  background jobs disabled");
    connection = null;
  }
}

export function isQueueEnabled(): boolean {
  return connection !== null;
}

const queues = new Map<string, Queue>();

// Returns null when Redis isn't configured  every call site must handle
// that by doing the work in-process immediately instead (see notify.ts and
// admin.ts's recalculate-all route for the pattern).
export function getQueue<T = unknown>(name: string): Queue<T> | null {
  if (!connection) return null;
  let queue = queues.get(name);
  if (!queue) {
    queue = new Queue(name, {
      connection,
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: "exponential", delay: 5000 },
        // Job history isn't needed for debugging beyond a bounded window
        // never let a busy queue grow Redis memory unbounded.
        removeOnComplete: { count: 200 },
        removeOnFail: { count: 500 },
      },
    });
    queues.set(name, queue);
  }
  return queue as Queue<T>;
}

// Registers a worker for `name` only when Redis is configured; returns null
// otherwise so callers can skip registration entirely rather than branch on
// a dummy worker object.
export function registerWorker<T = unknown>(name: string, processor: Processor<T>): Worker<T> | null {
  if (!connection) return null;
  const worker = new Worker<T>(name, processor, { connection, concurrency: 5 });
  worker.on("failed", (job, err) => {
    logger.error({ queue: name, jobId: job?.id, err }, "[queue] job failed");
  });
  return worker;
}

export async function closeQueues(): Promise<void> {
  await Promise.all(Array.from(queues.values()).map((q) => q.close()));
}
