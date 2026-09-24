import { randomUUID } from "crypto";
import { Request, Response, NextFunction } from "express";
import { logger } from "../config/logger";
import { AuthedRequest } from "./auth";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      id: string;
    }
  }
}

// Every request gets a stable id, reused from an incoming X-Request-Id if
// the caller (or a proxy/load balancer in front of this service) already
// set one, so a single request can be traced across multiple hops instead
// of getting a new id at each one. Always echoed back on the response so a
// client can report "this exact request" when something goes wrong.
export function requestId(req: Request, res: Response, next: NextFunction) {
  req.id = (req.header("x-request-id") || randomUUID()).slice(0, 100);
  res.setHeader("X-Request-Id", req.id);
  next();
}

// One structured log line per request, once it finishes  method, path,
// status, duration, the request id, and the authenticated user when known.
// Deliberately logs on `finish` (not at request start) so status/duration
// are available in the same line instead of split across two log entries.
export function requestLogger(req: AuthedRequest, res: Response, next: NextFunction) {
  const startedAt = process.hrtime.bigint();
  res.on("finish", () => {
    const durationMs = Number(process.hrtime.bigint() - startedAt) / 1_000_000;
    logger.info({
      requestId: req.id,
      method: req.method,
      path: req.path,
      statusCode: res.statusCode,
      durationMs: Math.round(durationMs * 100) / 100,
      userId: req.dbUser?._id ? String(req.dbUser._id) : undefined,
    });
  });
  next();
}
