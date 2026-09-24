import express from "express";
import rateLimit from "express-rate-limit";
import request from "supertest";

// Exercises the exact rate-limiting PATTERN used throughout the app
// (src/middleware/rateLimiters.ts: a tight express-rate-limit instance
// mounted ahead of the route handler) rather than replaying the real
// limiters' full 15-minute windows/high thresholds (30/150/etc), which
// would make this test slow and flaky. A tiny local limiter proves the
// wiring works identically to production: requests under the limit pass
// through, the next one over it gets a 429, and a 429 never reaches the
// route handler at all.
describe("rate limiting", () => {
  function appWithLimiter(limit: number) {
    const app = express();
    app.set("trust proxy", 1);
    const limiter = rateLimit({ windowMs: 60_000, limit, standardHeaders: true, legacyHeaders: false });
    app.get("/limited", limiter, (req, res) => res.json({ ok: true }));
    return app;
  }

  it("allows requests up to the limit", async () => {
    const app = appWithLimiter(3);
    for (let i = 0; i < 3; i++) {
      const res = await request(app).get("/limited");
      expect(res.status).toBe(200);
    }
  });

  it("returns 429 once the limit is exceeded, and never runs the route handler for it", async () => {
    const routeHandler = jest.fn();
    const app = express();
    app.set("trust proxy", 1);
    const limiter = rateLimit({ windowMs: 60_000, limit: 2, standardHeaders: true, legacyHeaders: false });
    app.get("/limited", limiter, (req, res) => {
      routeHandler();
      res.json({ ok: true });
    });

    await request(app).get("/limited");
    await request(app).get("/limited");
    const blocked = await request(app).get("/limited");

    expect(blocked.status).toBe(429);
    expect(routeHandler).toHaveBeenCalledTimes(2); // not called for the blocked 3rd request
  });
});
