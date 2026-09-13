import express from "express";
import cors from "cors";
import helmet from "helmet";
import compression from "compression";
import morgan from "morgan";
import rateLimit from "express-rate-limit";
import { clerkMiddleware } from "@clerk/express";
import { env } from "./config/env";
import routes from "./routes";
import { notFoundHandler, errorHandler } from "./middleware/errorHandler";

export function createApp() {
  const app = express();

  // Requests arrive via ngrok (dev) / a load balancer (prod) carrying
  // X-Forwarded-For, so Express needs to trust the first proxy hop to
  // read the real client IP — without this express-rate-limit throws
  // ERR_ERL_UNEXPECTED_X_FORWARDED_FOR on every request.
  app.set("trust proxy", 1);

  app.use(helmet());
  app.use(
    cors({
      origin: env.corsOrigins.length > 0 ? env.corsOrigins : true,
      credentials: true,
    })
  );
  app.use(compression());
  app.use(morgan(env.isProduction ? "combined" : "dev"));

  const limiter = rateLimit({ windowMs: 15 * 60 * 1000, limit: 300, standardHeaders: true, legacyHeaders: false });
  app.use("/api", limiter);

  // The Clerk webhook route needs the exact raw bytes to verify its
  // signature, so capture them alongside the parsed body via `verify`
  // rather than trying to special-case that one route around this
  // global parser (Express commits to one body-parsing strategy per
  // request — you can't re-read the stream in a route-level middleware).
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
  // every downstream route — this replaces the deprecated, unmaintained
  // @clerk/clerk-sdk-node's per-route ClerkExpressRequireAuth()/WithAuth(),
  // which crashed the process on real (non-empty) JWTs.
  app.use(clerkMiddleware());

  app.get("/health", (req, res) => res.json({ status: "ok", env: env.nodeEnv }));

  app.use("/api", routes);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
