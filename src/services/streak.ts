import { Types } from "mongoose";
import { User } from "../models/User";
import { localDateStr, localHour, addDaysToDateStr, nextBoundaryUtc } from "./streakTime";

export type StreakState = "ACTIVE" | "COMPLETED_TODAY" | "MISSED" | "NEW_DAY_AVAILABLE";

export interface StreakStateResult {
  state: StreakState;
  // The streak's current, true count  0 whenever `state` is MISSED or
  // NEW_DAY_AVAILABLE (there is nothing active to show), matching what
  // recordDailyActivity will actually persist the next time it runs.
  streakDays: number;
  // Only meaningful when `state === "MISSED"`  the count the streak had
  // right before it broke, for "your streak was N days" messaging (since
  // `streakDays` itself is already zeroed by then).
  previousStreakDays: number;
  streakAtRisk: boolean;
  // ISO UTC timestamp of the next 1:00 AM local boundary  lets the client
  // schedule a single timer to recheck the streak instead of polling.
  nextBoundaryAt: string;
}

// "Today" for every streak/daily-goal computation  always the user's own
// configured timezone (User.timezone, captured once client-side; see
// app/_layout.tsx's auto-capture effect), never the server's or device's
// clock. Falls back to UTC only for a user who hasn't had one captured yet.
export function todayStr(timezone?: string, now: Date = new Date()): string {
  return localDateStr(now, timezone || "UTC");
}

// Backend-authoritative streak status  the single place that decides
// ACTIVE / COMPLETED_TODAY / MISSED / NEW_DAY_AVAILABLE. A "streak day" is
// an ordinary calendar date in the user's timezone, but the moment a missed
// day is actually reported as broken is deliberately held back until
// 1:00 AM local time the *following* day  a one-hour grace window so the
// UI never flips to "Streak Ended" the instant the clock ticks past
// midnight. This is purely a display-timing courtesy: it can never let a
// later completion retroactively "save" an already-missed day  see
// recordDailyActivity below, which always uses the strict yesterday-only
// rule regardless of the hour.
export function getStreakState(
  rawStreakDays: number,
  lastStreakDate: string | undefined,
  timezone: string | undefined,
  now: Date = new Date()
): StreakStateResult {
  const tz = timezone || "UTC";
  const today = localDateStr(now, tz);
  const nextBoundaryAt = nextBoundaryUtc(now, tz).toISOString();

  if (!lastStreakDate || rawStreakDays === 0) {
    return { state: "NEW_DAY_AVAILABLE", streakDays: 0, previousStreakDays: 0, streakAtRisk: false, nextBoundaryAt };
  }

  if (lastStreakDate === today) {
    return { state: "COMPLETED_TODAY", streakDays: rawStreakDays, previousStreakDays: 0, streakAtRisk: false, nextBoundaryAt };
  }

  const yesterday = addDaysToDateStr(today, -1);
  if (lastStreakDate === yesterday) {
    return { state: "ACTIVE", streakDays: rawStreakDays, previousStreakDays: 0, streakAtRisk: false, nextBoundaryAt };
  }

  const twoDaysAgo = addDaysToDateStr(today, -2);
  if (lastStreakDate === twoDaysAgo && localHour(now, tz) < 1) {
    // Still inside yesterday's one-hour grace window (00:00-00:59 local,
    // today)  the miss is real but not finalized/shown yet.
    return { state: "ACTIVE", streakDays: rawStreakDays, previousStreakDays: 0, streakAtRisk: false, nextBoundaryAt };
  }

  return { state: "MISSED", streakDays: 0, previousStreakDays: rawStreakDays, streakAtRisk: true, nextBoundaryAt };
}

// Real, backend-computed learning streak. Call exactly once per user-local
// calendar day  the caller (grantLessonCompletion) gates this on "was this
// the day's first completed lesson" (DailyGoal.completedLessons === 1 right
// after the increment), and this function *also* independently no-ops if
// lastStreakDate is already today, so a duplicate call is always harmless.
// The client is never trusted with this value  it's derived purely from
// server-side activity records, keyed to the user's own configured
// timezone (not server or device time).
export async function recordDailyActivity(userId: Types.ObjectId): Promise<{ streakDays: number; increased: boolean }> {
  const user = await User.findById(userId).select("streakDays lastStreakDate timezone");
  if (!user) return { streakDays: 0, increased: false };

  const today = todayStr(user.timezone);
  if (user.lastStreakDate === today) return { streakDays: user.streakDays, increased: false };

  const yesterday = addDaysToDateStr(today, -1);
  const continuesStreak = user.lastStreakDate === yesterday;
  user.streakDays = continuesStreak ? user.streakDays + 1 : 1;
  user.lastStreakDate = today;
  await user.save();
  return { streakDays: user.streakDays, increased: true };
}
