// Run weekly (via your host's scheduled-job feature, e.g. a cron trigger
// on Railway/Render, or a system crontab pointing at `npm run cron:settle-leaderboard`).
// Freezes the current week, pays out the top 5, notifies them, and opens a fresh week.
import mongoose from "mongoose";
import { connectDB } from "../config/db";
import { settleWeeklyLeaderboard } from "../services/leaderboard";

async function main() {
  await connectDB();
  const board = await settleWeeklyLeaderboard();
  // eslint-disable-next-line no-console
  console.log(`[cron] settled leaderboard for week starting ${board.weekStart.toISOString()}`);
  await mongoose.disconnect();
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error("[cron] settleLeaderboard failed", err);
  process.exit(1);
});
