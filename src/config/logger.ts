import pino from "pino";
import { env } from "./env";

// One structured logger for the whole app. `pino-pretty` isn't pulled in
// deliberately  production almost always ships JSON lines straight to
// whatever log aggregator/host is watching stdout; readable-in-a-terminal
// formatting during local dev is a "nice to have," not worth the extra
// dependency for a backend this size (plain JSON is still readable enough
// while iterating locally).
export const logger = pino({
  level: env.logLevel,
  // Never let a secret or token end up in a log line even if some future
  // call site accidentally logs a whole object that happens to contain one
  // (e.g. `logger.info({ user: req.dbUser })`)  redact by key name
  // wherever it appears in the object tree, not just at known top-level
  // paths.
  redact: {
    paths: [
      "*.password",
      "*.token",
      "*.accessToken",
      "*.refreshToken",
      "*.secret",
      "*.apiKey",
      "*.clerkSecretKey",
      "*.authorization",
      "*.cookie",
      "req.headers.authorization",
      "req.headers.cookie",
    ],
    censor: "[redacted]",
  },
});
