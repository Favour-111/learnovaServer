import { Request, Response, NextFunction } from "express";
import { Webhook } from "svix";
import { env } from "../config/env";
import { User, INotificationPreferences } from "../models/User";
import { AuthedRequest } from "../middleware/auth";
import { getStreakState } from "../services/streak";
import { isValidTimeZone } from "../services/streakTime";

// Clerk webhook: keeps our Mongo User in sync with Clerk (source of truth
// for identity/credentials). Fired on user.created / user.updated / user.deleted.
export async function handleClerkWebhook(req: Request, res: Response, next: NextFunction) {
  try {
    // Captured by the `verify` callback on the global express.json()
    // parser in app.ts  svix needs the exact raw bytes to check the
    // signature, not the re-serialized parsed object.
    const payload = (req as Request & { rawBody: Buffer }).rawBody;
    const headers = {
      "svix-id": req.header("svix-id") ?? "",
      "svix-timestamp": req.header("svix-timestamp") ?? "",
      "svix-signature": req.header("svix-signature") ?? "",
    };
    const wh = new Webhook(env.clerkWebhookSecret);
    const evt = wh.verify(payload, headers) as {
      type: string;
      data: { id: string; email_addresses: { email_address: string }[]; first_name?: string; last_name?: string; image_url?: string };
    };

    if (evt.type === "user.created" || evt.type === "user.updated") {
      const email = evt.data.email_addresses[0]?.email_address ?? "";
      const name = [evt.data.first_name, evt.data.last_name].filter(Boolean).join(" ") || email;
      await User.findOneAndUpdate(
        { clerkId: evt.data.id },
        { clerkId: evt.data.id, email, name, avatarUrl: evt.data.image_url },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );
    }

    if (evt.type === "user.deleted") {
      await User.deleteOne({ clerkId: evt.data.id });
    }

    res.status(200).json({ received: true });
  } catch (err) {
    next(err);
  }
}

// GET /api/auth/me  returns (and lazily provisions) the current user's
// profile. Also the app's main "trusted clock" hydration point: serverTime
// lets the client correct for its own clock/timezone tampering (see
// learnovaApp/src/hooks/useStreakBoundary.ts)  nothing streak-related on
// the frontend should ever schedule off `new Date()` alone.
export async function getMe(req: AuthedRequest, res: Response) {
  if (!req.dbUser) return res.status(401).json({ error: "Unauthorized" });
  const streak = getStreakState(req.dbUser.streakDays, req.dbUser.lastStreakDate, req.dbUser.timezone);
  res.json({
    user: {
      ...req.dbUser.toObject(),
      streakDays: streak.streakDays,
      streakAtRisk: streak.streakAtRisk,
      streakState: streak.state,
      streakPreviousDays: streak.previousStreakDays,
      streakNextBoundaryAt: streak.nextBoundaryAt,
    },
    serverTime: new Date().toISOString(),
  });
}

// PUT /api/auth/me/profile  name/email edits from the app's Edit Profile
// screen. Clerk stays the source of truth (the frontend applies the same
// change there first, via its own SDK), this just keeps our Mongo copy in
// step immediately rather than waiting on the next user.updated webhook.
export async function updateProfile(req: AuthedRequest, res: Response) {
  if (!req.dbUser) return res.status(401).json({ error: "Unauthorized" });
  const { name, email, reducedMotion, dailyGoalTarget, timezone } = req.body as {
    name?: string;
    email?: string;
    reducedMotion?: boolean;
    dailyGoalTarget?: number;
    timezone?: string;
  };
  if (typeof name === "string" && name.trim()) req.dbUser.name = name.trim();
  if (typeof email === "string" && email.trim()) req.dbUser.email = email.trim();
  if (typeof reducedMotion === "boolean") req.dbUser.reducedMotion = reducedMotion;
  if (typeof dailyGoalTarget === "number" && Number.isFinite(dailyGoalTarget)) {
    req.dbUser.dailyGoalTarget = Math.min(10, Math.max(1, Math.round(dailyGoalTarget)));
  }
  if (typeof timezone === "string" && timezone.trim()) {
    if (!isValidTimeZone(timezone.trim())) {
      return res.status(400).json({ error: "Invalid timezone" });
    }
    req.dbUser.timezone = timezone.trim();
  }
  await req.dbUser.save();
  res.json({ user: req.dbUser });
}

// PUT /api/auth/me/interests  optional interest selection from onboarding.
export async function setInterests(req: AuthedRequest, res: Response) {
  const { interests } = req.body as { interests: string[] };
  if (!req.dbUser) return res.status(401).json({ error: "Unauthorized" });
  req.dbUser.interests = Array.isArray(interests) ? interests : [];
  await req.dbUser.save();
  res.json({ user: req.dbUser });
}

const DEFAULT_NOTIFICATION_PREFERENCES: INotificationPreferences = {
  learningReminders: true,
  courseUpdates: true,
  achievementAlerts: true,
  streakReminders: true,
  courseRecommendations: true,
  communityActivity: true,
};

// PUT /api/auth/me/notification-preferences  the Notifications screen's
// settings sheet. Merges onto whatever the user already had (or the
// all-true defaults, for a user who predates this field) rather than
// requiring the full object every time.
export async function setNotificationPreferences(req: AuthedRequest, res: Response) {
  if (!req.dbUser) return res.status(401).json({ error: "Unauthorized" });
  const updates = req.body as Partial<INotificationPreferences>;
  req.dbUser.notificationPreferences = {
    ...DEFAULT_NOTIFICATION_PREFERENCES,
    ...req.dbUser.notificationPreferences,
    ...updates,
  };
  await req.dbUser.save();
  res.json({ user: req.dbUser });
}
