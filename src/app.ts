// Must be the very first import: it patches Express's Router so an async
// route handler's rejected promise is forwarded to next(err) automatically.
// Without it (plain Express 4 behavior), a thrown/rejected error inside any
// `async function` route handler  a malformed ObjectId, a DB hiccup,
// anything  becomes an unhandled rejection that crashes the whole process
// instead of reaching errorHandler below, which already has the right
// logic (e.g. mapping a Mongoose CastError to a clean 400) but was never
// actually receiving these errors. This has to load before `routes` is
// imported, since that's when the individual Router()s get constructed.
import "express-async-errors";
import express from "express";
import mongoose from "mongoose";
import cors from "cors";
import helmet from "helmet";
import compression from "compression";
import rateLimit from "express-rate-limit";
import { clerkMiddleware } from "@clerk/express";
import { env } from "./config/env";
import routes from "./routes";
import { notFoundHandler, errorHandler } from "./middleware/errorHandler";
import { requestId, requestLogger } from "./middleware/requestLogger";

export function createApp() {
  const app = express();

  // Requests arrive via ngrok (dev) / a load balancer (prod) carrying
  // X-Forwarded-For, so Express needs to trust the first proxy hop to
  // read the real client IP  without this express-rate-limit throws
  // ERR_ERL_UNEXPECTED_X_FORWARDED_FOR on every request.
  app.set("trust proxy", 1);

  // Mounted first, ahead of everything else, so literally every request
  // gets an id and a log line  including one that a later middleware
  // (rate limiter, CORS, auth) ends up rejecting. Replaces morgan: this
  // covers the same method/path/status/duration plus a request id and the
  // authenticated user (once attachDbUser runs later in the chain), in the
  // same structured format every other log line in the app now uses.
  app.use(requestId);
  app.use(requestLogger);

  app.use(helmet());
  // CORS only governs browser-enforced cross-origin calls (the admin
  // panel's web app)  it has no effect on the mobile app or any other
  // non-browser HTTP client, so tightening this never breaks learnovaApp.
  // In production with no CORS_ORIGINS configured, fail closed (reject
  // every cross-origin browser request) rather than the permissive
  // reflect-any-origin fallback dev relies on  a misconfigured production
  // deploy should be a loud "the admin panel can't reach the API", not a
  // silently wide-open API.
  app.use(
    cors({
      origin: env.corsOrigins.length > 0 ? env.corsOrigins : env.isProduction ? false : true,
      credentials: true,
    })
  );
  app.use(compression());

  const limiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 300, standardHeaders: true, legacyHeaders: false });
  app.use("/api", limiter);

  // The Clerk webhook route needs the exact raw bytes to verify its
  // signature, so capture them alongside the parsed body via `verify`
  // rather than trying to special-case that one route around this
  // global parser (Express commits to one body-parsing strategy per
  // request  you can't re-read the stream in a route-level middleware).
  app.use(
    express.json({
      limit: "2mb",
      verify: (req, _res, buf) => {
        (req as express.Request & { rawBody: Buffer }).rawBody = buf;
      },
    })
  );
  app.use(express.urlencoded({ extended: true }));

  // Verifies the session JWT (if present) and populates getAuth(req) for
  // every downstream route  this replaces the deprecated, unmaintained
  // @clerk/clerk-sdk-node's per-route ClerkExpressRequireAuth()/WithAuth(),
  // which crashed the process on real (non-empty) JWTs.
  app.use(clerkMiddleware());

  // Process-liveness only  no DB dependency, always fast, safe for a
  // load balancer / orchestrator to hit frequently.
  app.get("/health", (req, res) => res.json({ status: "ok", env: env.nodeEnv }));

  // Actual DB connectivity, for a deploy step or monitor that specifically
  // needs to know Mongo is reachable, not just that the Node process is up.
  // No internal detail exposed (no host, no connection string, no driver
  // error object)  just enough to alert on.
  app.get("/health/db", async (req, res) => {
    const readyState = mongoose.connection.readyState; // 1 = connected
    if (readyState !== 1) {
      return res.status(503).json({ status: "unhealthy", database: "disconnected" });
    }
    try {
      await mongoose.connection.db!.admin().ping();
      res.json({ status: "healthy", database: "connected" });
    } catch {
      res.status(503).json({ status: "unhealthy", database: "unreachable" });
    }
  });

  app.use("/api", routes);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
