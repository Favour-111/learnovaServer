import { Types } from "mongoose";
import { Notification, NotificationType } from "../models/Notification";
import { User, INotificationPreferences } from "../models/User";
import { emitUserUpdate } from "./realtime";
import { sendPushToUsers } from "./push";

// The single choke point every notification-producing code path should go
// through  same role for notifications that awardXpAndCredits
// (services/gamification.ts) plays for XP/credits. Keeps "create the
// in-app record", "wake up anyone with the app open right now", and "push
// it to their device" from drifting apart across call sites.

// Maps each notification type to the settings-sheet toggle that governs it.
// A type with no entry here (currently just "announcement") is always
// delivered  platform-wide announcements aren't user-optional, same as
// most apps treat account/service notices as non-negotiable.
const TYPE_TO_PREFERENCE: Partial<Record<NotificationType, keyof INotificationPreferences>> = {
  lesson_complete: "learningReminders",
  course_progress: "learningReminders",
  project_result: "learningReminders",
  project_retry: "learningReminders",
  new_course: "courseUpdates",
  new_lesson: "courseUpdates",
  achievement_unlocked: "achievementAlerts",
  level_up: "achievementAlerts",
  xp_earned: "achievementAlerts",
  credits_earned: "achievementAlerts",
  certificate_issued: "achievementAlerts",
  streak_reminder: "streakReminders",
  recommended_course: "courseRecommendations",
  leaderboard_position: "communityActivity",
  leaderboard_result: "communityActivity",
};

// A user who predates the settings sheet has no notificationPreferences
// object at all  that must resolve to "everything on" (opt-out model), not
// silently go quiet for people who never touched the setting.
function isTypeAllowed(prefs: INotificationPreferences | undefined, type: NotificationType): boolean {
  const key = TYPE_TO_PREFERENCE[type];
  if (!key) return true;
  if (!prefs) return true;
  return prefs[key] !== false;
}

// Single-user case (e.g. a streak reminder for one at-risk learner).
export async function notifyUser(
  userId: Types.ObjectId,
  type: NotificationType,
  title: string,
  body: string,
  data?: Record<string, unknown>
): Promise<void> {
  const user = await User.findById(userId, "pushTokens notificationPreferences");
  if (!user || !isTypeAllowed(user.notificationPreferences, type)) return;

  await Notification.create({ user: userId, type, title, body, data });
  emitUserUpdate(String(userId), type);
  // Not awaited by design  see sendPushToUsers.
  sendPushToUsers([{ _id: user._id, pushTokens: user.pushTokens }], { title, body, data }).catch((err) =>
    // eslint-disable-next-line no-console
    console.error("[notify] push send failed", err)
  );
}

// Fan-out case (new course, new lesson, announcement)  one Notification
// document per opted-in recipient via a single insertMany, then pushes
// dispatched in the background so a large fan-out never blocks the admin
// request that triggered it.
export async function notifyUsers(
  userIds: Types.ObjectId[],
  type: NotificationType,
  title: string,
  body: string,
  data?: Record<string, unknown>
): Promise<void> {
  if (userIds.length === 0) return;

  const candidates = await User.find({ _id: { $in: userIds } }, "pushTokens notificationPreferences");
  const recipients = candidates.filter((u) => isTypeAllowed(u.notificationPreferences, type));
  if (recipients.length === 0) return;

  await Notification.insertMany(recipients.map((user) => ({ user: user._id, type, title, body, data })));

  recipients.forEach((user) => emitUserUpdate(String(user._id), type));

  sendPushToUsers(
    recipients.map((r) => ({ _id: r._id, pushTokens: r.pushTokens })),
    { title, body, data }
  ).catch((err) =>
    // eslint-disable-next-line no-console
    console.error("[notify] bulk push send failed", err)
  );
}
