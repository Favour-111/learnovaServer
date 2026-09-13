// One-off dev seed: populates this week's leaderboard with a few dummy
// competitor accounts plus the real demo user, so the Home screen's
// "Weekly Leaderboard" card has something to show. Safe to re-run — dummy
// users are upserted by email, and re-running just adds another XP
// transaction on top (bumping everyone's weekly total, ranking stays the
// same shape).
//
// Usage: npm run seed:leaderboard --workspace backend   (or from backend/: npm run seed:leaderboard)
import mongoose from "mongoose";
import { connectDB } from "../config/db";
import { User } from "../models/User";
import { XPTransaction } from "../models/XPTransaction";
import { recomputeCurrentLeaderboard } from "../services/leaderboard";

const DEMO_USER_EMAIL = "omojolaobaloluwa@gmail.com";

// [name, email, weekly XP amount] — ranked by amount, descending.
const ENTRIES: Array<{ name: string; email?: string; amount: number; isDemoUser?: boolean }> = [
  { name: "Alex Rivera", email: "alex.rivera@learnova-demo.test", amount: 2200 },
  { name: "Priya Sharma", email: "priya.sharma@learnova-demo.test", amount: 1850 },
  { name: "Omojola Obaloluwa", amount: 1500, isDemoUser: true },
  { name: "Marcus Chen", email: "marcus.chen@learnova-demo.test", amount: 1200 },
  { name: "Sofia Martins", email: "sofia.martins@learnova-demo.test", amount: 950 },
];

async function main() {
  await connectDB();

  const demoUser = await User.findOne({ email: DEMO_USER_EMAIL });
  if (!demoUser) {
    // eslint-disable-next-line no-console
    console.warn(`[seed:leaderboard] No user found with email ${DEMO_USER_EMAIL} — sign in with that account once first.`);
  }

  for (const entry of ENTRIES) {
    let user;
    if (entry.isDemoUser) {
      user = demoUser;
    } else {
      user = await User.findOneAndUpdate(
        { email: entry.email },
        {
          email: entry.email,
          name: entry.name,
          // Fake, stable, never-real clerkId — this account can never sign
          // in for real, so it can't collide with an actual Clerk webhook.
          clerkId: `demo_${entry.email}`,
          $setOnInsert: { role: "user", xp: 0, credits: 0, streakDays: 0 },
        },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );
    }
    if (!user) continue;

    await XPTransaction.create({
      user: user._id,
      amount: entry.amount,
      source: "lesson",
      balanceAfter: entry.amount,
    });
  }

  const board = await recomputeCurrentLeaderboard();

  // eslint-disable-next-line no-console
  console.log(`[seed:leaderboard] seeded ${ENTRIES.length} weekly XP entries for board week ${board.weekStart.toISOString().slice(0, 10)}`);
  await mongoose.disconnect();
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error("[seed:leaderboard] failed", err);
  process.exit(1);
});
