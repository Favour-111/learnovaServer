import { Request, Response, NextFunction } from "express";
import { logger } from "../config/logger";

export class ApiError extends Error {
  status: number;
  // Machine-readable  optional since most existing throw sites only ever
  // cared about status+message; a generic one is derived from the status
  // below when omitted, so nothing that constructs ApiError today needs to
  // change.
  code?: string;
  constructor(status: number, message: string, code?: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

const DEFAULT_CODES: Record<number, string> = {
  400: "BAD_REQUEST",
  401: "UNAUTHORIZED",
  402: "PAYMENT_REQUIRED",
  403: "FORBIDDEN",
  404: "NOT_FOUND",
  409: "CONFLICT",
  429: "TOO_MANY_REQUESTS",
  500: "INTERNAL_ERROR",
  502: "UPSTREAM_ERROR",
  503: "SERVICE_UNAVAILABLE",
};

export function notFoundHandler(req: Request, res: Response) {
  const message = `No route: ${req.method} ${req.path}`;
  res.status(404).json({ error: message, success: false, message, code: "NOT_FOUND", requestId: req.id });
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function errorHandler(err: unknown, req: Request, res: Response, next: NextFunction) {
  // A malformed create/update body (missing required field, wrong type,
  // bad ObjectId) is a client mistake, not a server failure  map
  // Mongoose's own error types to 400 instead of the default 500 so admin
  // forms get a real message back instead of "Internal server error".
  const isMongooseValidation = err instanceof Error && (err.name === "ValidationError" || err.name === "CastError");
  const status = err instanceof ApiError ? err.status : isMongooseValidation ? 400 : 500;
  // ApiError and Mongoose validation/cast errors are always about the
  // client's own request (a missing field, a bad id, a deliberate "you
  // can't do that")  their message is written specifically to be shown.
  // Anything else reaching here is an unexpected failure (a DB hiccup, an
  // AWS SDK error, a bug) whose .message can contain internal detail
  // (connection strings, ARNs, file paths, stack-adjacent info) that must
  // never reach the client, even though it's exactly what gets logged
  // server-side below.
  const isSafeToShow = err instanceof ApiError || isMongooseValidation;
  const message = isSafeToShow && err instanceof Error ? err.message : "Internal server error";
  const code = (err instanceof ApiError && err.code) || (isMongooseValidation ? "VALIDATION_ERROR" : DEFAULT_CODES[status] ?? "ERROR");

  // Logged unconditionally (previously dev-only)  a production error that's
  // never logged anywhere is effectively invisible until a user complains.
  // The request id ties this log line back to the matching request-finish
  // line requestLogger already emitted, and (should a client report a
  // problem) to whatever id they were handed back in X-Request-Id / this
  // same JSON body below.
  logger.error({
    requestId: req.id,
    method: req.method,
    path: req.path,
    statusCode: status,
    errorType: err instanceof Error ? err.constructor.name : typeof err,
    err,
  });

  // `error` is kept for the existing frontend (learnovaApp/admin both read
  // err.response.data.error today)  success/message/code/requestId are
  // additive, for either to adopt later without a forced migration.
  res.status(status).json({ error: message, success: false, message, code, requestId: req.id });
}
