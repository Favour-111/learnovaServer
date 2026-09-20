import { Request, Response, NextFunction } from "express";
import { getAuth, clerkClient } from "@clerk/express";
import { User } from "../models/User";

export interface AuthedRequest extends Request {
  dbUser?: InstanceType<typeof User>;
}

// Rejects requests with no verified Clerk session. Relies on clerkMiddleware()
// being mounted globally in app.ts (that's what populates getAuth(req)).
export function requireAuth(req: AuthedRequest, res: Response, next: NextFunction) {
  const { userId } = getAuth(req);
  if (!userId) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  next();
}

// No-op kept for readability at call sites: clerkMiddleware() is mounted
// globally, so auth state is already available to every route without this 
// it exists so route files can still document "this route behaves
// differently when signed in" without pulling in a real dependency.
export function withAuth(req: AuthedRequest, res: Response, next: NextFunction) {
  next();
}

// The Clerk webhook (routes/auth.ts) is the primary way Mongo User docs get
// created/kept in sync  but it needs a publicly reachable URL, which
// `localhost` isn't, so nothing syncs in local dev unless you tunnel it.
// Rather than hard-depending on that, lazily provision the Mongo user the
// first time we see a session for a clerkId with no matching record, using
// Clerk's own API for the profile fields. Safe to call repeatedly  it's a
// find-or-create keyed on the unique `clerkId` index.
async function getOrCreateDbUser(clerkId: string) {
  const existing = await User.findOne({ clerkId });
  if (existing) return existing;

  const clerkUser = await clerkClient.users.getUser(clerkId);
  const primaryEmail =
    clerkUser.emailAddresses.find((e) => e.id === clerkUser.primaryEmailAddressId)?.emailAddress ??
    clerkUser.emailAddresses[0]?.emailAddress ??
    "";
  const name = [clerkUser.firstName, clerkUser.lastName].filter(Boolean).join(" ") || primaryEmail || "Learner";

  return User.create({
    clerkId,
    email: primaryEmail,
    name,
    avatarUrl: clerkUser.imageUrl,
  });
}

// Loads (or lazily provisions) the corresponding Mongo user document for
// the verified Clerk session and attaches it to the request.
export async function attachDbUser(req: AuthedRequest, res: Response, next: NextFunction) {
  try {
    const { userId } = getAuth(req);
    if (!userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    req.dbUser = await getOrCreateDbUser(userId);
    next();
  } catch (err) {
    next(err);
  }
}

// Like attachDbUser, but for routes mounted behind `withAuth` (optional
// auth): if there's no verified session, it just leaves req.dbUser
// undefined instead of rejecting the request  callers branch on
// req.dbUser being present rather than relying on a 401.
export async function attachDbUserOptional(req: AuthedRequest, res: Response, next: NextFunction) {
  try {
    const { userId } = getAuth(req);
    if (userId) {
      req.dbUser = await getOrCreateDbUser(userId);
    }
    next();
  } catch (err) {
    next(err);
  }
}

export function requireAdmin(req: AuthedRequest, res: Response, next: NextFunction) {
  if (req.dbUser?.role !== "admin") {
    return res.status(403).json({ error: "Admin access required" });
  }
  next();
}
