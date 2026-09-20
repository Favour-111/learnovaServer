// Run daily (via your host's scheduled-job feature, e.g. a cron trigger on
// Railway/Render, or a system crontab pointing at `npm run cron:streak-reminders`).
// Finds every user whose streak has actually finalized as MISSED today
// (services/streak.getStreakState  a per-user timezone + 1AM-boundary
// check, not a single global cutoff) and hasn't already been reminded
// today, and sends them a "Keep Your Streak Alive" notification.
//
// Caveat: this still runs on a single daily trigger (whatever cadence your
// host's scheduler is configured for), not once per user's own midnight 
// with learners spread across timezones, "today" finalizes at a different
// real-world moment for each of them, so depending on when this job runs
// some users may be checked a little before or after their own boundary.
// The in-app streak state itself is always correct regardless (computed
// fresh per-request); this only affects reminder *timing*, not accuracy.
import mongoose from "mongoose";
import { connectDB } from "../config/db";
import { User } from "../models/User";
import { Notification } from "../models/Notification";
import { getStreakState, todayStr } from "../services/streak";
import { zonedTimeToUtc } from "../services/streakTime";
import { notifyUser } from "../services/notify";

async function main() {
  await connectDB();

  const users = await User.find({ streakDays: { $gt: 0 } }, "_id streakDays lastStreakDate timezone");

  let remindedCount = 0;
  for (const user of users) {
    const streak = getStreakState(user.streakDays, user.lastStreakDate, user.timezone);
    if (streak.state !== "MISSED") continue;

    const startOfToday = zonedTimeToUtc(todayStr(user.timezone), 0, 0, user.timezone || "UTC");
    // eslint-disable-next-line no-await-in-loop
    const alreadyRemindedToday = await Notification.exists({
      user: user._id,
      type: "streak_reminder",
      createdAt: { $gte: startOfToday },
    });
    if (alreadyRemindedToday) continue;

    // eslint-disable-next-line no-await-in-loop
    await notifyUser(
      user._id,
      "streak_reminder",
      "Keep Your Streak Alive",
      `You're one lesson away from keeping your ${user.streakDays}-day learning streak alive. Continue learning now.`
    );
    remindedCount += 1;
  }

  // eslint-disable-next-line no-console
  console.log(`[cron] streak reminders: ${remindedCount} sent of ${users.length} users with an active streak`);
  await mongoose.disconnect();
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error("[cron] sendStreakReminders failed", err);
  process.exit(1);
});
