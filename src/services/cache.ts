import Redis from "ioredis";
import { env } from "../config/env";
import { logger } from "../config/logger";

// Nothing in this file is required for the app to function  every export
// below fails open. No REDIS_URL configured means every read is a permanent
// "miss" (callers fall straight through to Mongo) and every write is a
// no-op. A REDIS_URL that's configured but currently unreachable behaves
// the exact same way: caching quietly turns itself off rather than ever
// taking the request down with it. This is deliberate per the "Redis
// failure must be non-fatal" requirement  never let this module be the
// reason a request fails.
let client: Redis | null = null;

if (env.redisUrl) {
  try {
    // `new Redis(url)` throws SYNCHRONOUSLY for a malformed URL (not just
    // an unreachable host  a genuinely invalid REDIS_URL value), which
    // would otherwise crash the whole process at import time, before any
    // of the runtime fail-open handling below ever gets a chance to run.
    // Caught here so a bad REDIS_URL degrades to "caching disabled" exactly
    // like an unset one, never a boot-time crash.
    client = new Redis(env.redisUrl, {
      // Fail fast instead of ioredis's default of buffering/retrying
      // commands indefinitely while disconnected  a cache lookup that
      // hangs is worse than one that immediately reports a miss.
      maxRetriesPerRequest: 1,
      // Bounded backoff, capped low, so a persistently-down Redis doesn't
      // spam reconnect attempts forever; ioredis keeps trying at this
      // interval in the background, transparently reconnecting once Redis
      // comes back.
      retryStrategy: (times) => Math.min(times * 200, 5000),
      lazyConnect: false,
    });

    // ioredis emits 'error' on every failed reconnect attempt while
    // disconnected  without a listener, Node's default EventEmitter
    // behavior is to throw and crash the process. Logged once per event
    // (not per cache call) so a prolonged outage doesn't flood logs on
    // every request either, since callers below never log on their own
    // miss path.
    client.on("error", (err) => {
      logger.warn({ err: err.message }, "[cache] redis error (falling back to source-of-truth for reads)");
    });
    client.on("connect", () => {
      logger.info("[cache] redis connected");
    });
  } catch (err) {
    logger.warn({ err }, "[cache] REDIS_URL is set but invalid  caching disabled");
    client = null;
  }
}

export function isCacheEnabled(): boolean {
  return client !== null;
}

// Used by server.ts's graceful shutdown (mirrors closeQueues in
// services/queue.ts) and by tests that construct a fresh client via
// jest.resetModules()  without this, a client's background reconnect
// timers keep a process/test worker alive past when it should exit.
export async function closeCache(): Promise<void> {
  if (!client) return;
  client.disconnect();
  client = null;
}

// Returns null on a genuine miss AND on any Redis failure  callers can't
// tell the difference, which is exactly the point (they shouldn't need to
// behave differently either way).
export async function getCache<T>(key: string): Promise<T | null> {
  if (!client) return null;
  try {
    const raw = await client.get(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch (err) {
    logger.warn({ err, key }, "[cache] get failed");
    return null;
  }
}

export async function setCache(key: string, value: unknown, ttlSeconds: number): Promise<void> {
  if (!client) return;
  try {
    await client.set(key, JSON.stringify(value), "EX", ttlSeconds);
  } catch (err) {
    logger.warn({ err, key }, "[cache] set failed");
  }
}

export async function deleteCache(...keys: string[]): Promise<void> {
  if (!client || keys.length === 0) return;
  try {
    await client.del(...keys);
  } catch (err) {
    logger.warn({ err, keys }, "[cache] delete failed");
  }
}

// The one function most call sites should actually use: try the cache,
// fall through to `fetcher` (the real Mongo query) on a miss OR any cache
// failure, and best-effort populate the cache for next time. `fetcher`
// always runs on a miss, so this never returns stale-forever data  a
// down Redis just means every request pays the full Mongo cost, which is
// exactly today's behavior with no caching at all.
export async function getOrSetCache<T>(key: string, ttlSeconds: number, fetcher: () => Promise<T>): Promise<T> {
  const cached = await getCache<T>(key);
  if (cached !== null) return cached;
  const fresh = await fetcher();
  await setCache(key, fresh, ttlSeconds);
  return fresh;
}
