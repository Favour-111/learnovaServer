import { Request, Response, NextFunction } from "express";
import { ZodSchema } from "zod";

// Rejects a malformed request body with a clean 400 before it ever reaches
// a controller, instead of letting a missing/wrong-typed field surface
// later as a confusing Mongoose CastError/ValidationError (or worse, silent
// wrong behavior for a field a controller reads without checking). Valid
// input passes through completely unchanged  req.body is replaced with the
// parsed (and now type-safe) result, not just checked.
export function validateBody(schema: ZodSchema) {
  return (req: Request, res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      return res.status(400).json({
        error: "Invalid request body",
        details: result.error.issues.map((issue) => ({ path: issue.path.join("."), message: issue.message })),
      });
    }
    req.body = result.data;
    next();
  };
}
