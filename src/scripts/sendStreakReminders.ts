// Run daily (via your host's scheduled-job feature, e.g. a cron trigger on
// Railway/Render, or a system crontab pointing at `npm run cron:streak-reminders`).
// Finds every user whose streak is at risk today and hasn't already been
// reminded today, and sends them a "Keep Your Streak Alive" notification.
import mongoose from "mongoose";
import { connectDB } from "../config/db";
import { User } from "../models/User";
import { Notification } from "../models/Notification";
import { getStreakStatus, todayStr } from "../services/achievements";
import { notifyUser } from "../services/notify";

async function main() {
  await connectDB();

  const startOfToday = new Date(`${todayStr()}T00:00:00.000Z`);
  const users = await User.find({ streakDays: { $gt: 0 } }, "_id streakDays lastStreakDate");

  let remindedCount = 0;
  for (const user of users) {
    const { streakAtRisk } = getStreakStatus(user.streakDays, user.lastStreakDate);
    if (!streakAtRisk) continue;

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
