import { Request, Response, NextFunction } from "express";
import { env } from "../config/env";

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export function notFoundHandler(req: Request, res: Response) {
  res.status(404).json({ error: `No route: ${req.method} ${req.path}` });
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function errorHandler(err: unknown, req: Request, res: Response, next: NextFunction) {
  // A malformed create/update body (missing required field, wrong type,
  // bad ObjectId) is a client mistake, not a server failure — map
  // Mongoose's own error types to 400 instead of the default 500 so admin
  // forms get a real message back instead of "Internal server error".
  const isMongooseValidation = err instanceof Error && (err.name === "ValidationError" || err.name === "CastError");
  const status = err instanceof ApiError ? err.status : isMongooseValidation ? 400 : 500;
  const message = err instanceof Error ? err.message : "Internal server error";
  if (!env.isProduction) {
    // eslint-disable-next-line no-console
    console.error(err);
  }
  res.status(status).json({ error: message });
}
