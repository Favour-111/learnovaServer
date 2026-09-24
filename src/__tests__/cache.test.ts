// Deliberately forces REDIS_URL unset for this file via jest.resetModules()
// + a fresh require, rather than trusting whatever the real environment's
// .env happens to contain (it may or may not have a REDIS_URL set locally)
// so this test proves the actual "Redis-ready but inactive" behavior
// regardless of the machine it runs on.
describe("cache service with no REDIS_URL configured", () => {
  const originalRedisUrl = process.env.REDIS_URL;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let cache: any;

  beforeAll(() => {
    delete process.env.REDIS_URL;
    jest.resetModules();
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    cache = require("../services/cache");
  });

  afterAll(async () => {
    await cache.closeCache();
    if (originalRedisUrl !== undefined) process.env.REDIS_URL = originalRedisUrl;
    jest.resetModules();
  });

  it("reports itself as disabled", () => {
    expect(cache.isCacheEnabled()).toBe(false);
  });

  it("getCache always misses", async () => {
    await expect(cache.getCache("any-key")).resolves.toBeNull();
  });

  it("setCache and deleteCache resolve without throwing", async () => {
    await expect(cache.setCache("any-key", { hello: "world" }, 60)).resolves.toBeUndefined();
    await expect(cache.deleteCache("any-key")).resolves.toBeUndefined();
  });

  it("getOrSetCache always calls the fetcher and returns its result", async () => {
    const fetcher = jest.fn().mockResolvedValue({ fresh: true });
    const result = await cache.getOrSetCache("any-key", 60, fetcher);
    expect(result).toEqual({ fresh: true });
    expect(fetcher).toHaveBeenCalledTimes(1);

    // A second call is still a miss (no Redis to have remembered anything)
    //  the fetcher must run again, proving nothing is silently cached
    // in-process either.
    const result2 = await cache.getOrSetCache("any-key", 60, fetcher);
    expect(result2).toEqual({ fresh: true });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
});

// A malformed (but non-empty) REDIS_URL must degrade to the exact same
// "disabled" state as an unset one, never crash the module at import time
// this is a regression test for a real bug caught while building this
// suite: `new Redis(url)` throws synchronously for a string `new URL()`
// can't parse at all (e.g. one containing spaces), and that exception was
// escaping uncaught before services/cache.ts wrapped the constructor in a
// try/catch. A bare hostname-shaped string (no spaces, no scheme) is
// deliberately NOT used here  ioredis accepts that as shorthand for "host,
// default port" and only fails later at connection time, which is a
// different (already-handled) code path, not this one.
describe("cache service with a malformed REDIS_URL", () => {
  const originalRedisUrl = process.env.REDIS_URL;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let cache: any;

  beforeAll(() => {
    process.env.REDIS_URL = "redis://this is not a valid url";
    jest.resetModules();
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    cache = require("../services/cache");
  });

  afterAll(async () => {
    await cache.closeCache();
    if (originalRedisUrl === undefined) delete process.env.REDIS_URL;
    else process.env.REDIS_URL = originalRedisUrl;
    jest.resetModules();
  });

  it("does not throw at import time, and disables caching", () => {
    expect(cache.isCacheEnabled()).toBe(false);
  });
});
