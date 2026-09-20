import { Leaderboard } from "../models/Leaderboard";
import { LeaderboardEntry } from "../models/LeaderboardEntry";
import { XPTransaction } from "../models/XPTransaction";
import { Notification } from "../models/Notification";
import { User } from "../models/User";
import { awardXpAndCredits } from "./gamification";
import { evaluateAchievements } from "./achievements";
import { LEADERBOARD_REWARD_DISTRIBUTION } from "../config/gamification";

function firstName(fullName: string): string {
  return fullName.trim().split(/\s+/)[0] ?? fullName;
}

function startOfWeek(date: Date): Date {
  const d = new Date(date);
  const day = d.getUTCDay();
  const diff = (day === 0 ? -6 : 1) - day; // Monday start
  d.setUTCDate(d.getUTCDate() + diff);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

export async function getOrCreateCurrentLeaderboard() {
  const weekStart = startOfWeek(new Date());
  const weekEnd = new Date(weekStart);
  weekEnd.setUTCDate(weekEnd.getUTCDate() + 7);

  let board = await Leaderboard.findOne({ weekStart });
  if (!board) {
    board = await Leaderboard.create({ weekStart, weekEnd, status: "active" });
  }
  return board;
}

// Ranking is purely weekly XP earned (sum of XPTransaction amounts since
// weekStart)  purchased/awarded Credits never factor in here. A user with
// no XPTransaction this week never appears here at all  no fake rank for
// sitting at 0.
//
// Ties are broken deterministically, never by whatever order Mongo happens
// to return: highest weekly XP first, then whoever's most recent XP
// transaction this week (the moment their running total arrived at that
// number) came earliest, then first name alphabetically. This is the only
// place `rank` gets assigned  both the live Ranks tab and
// settleWeeklyLeaderboard's payout read it from here, so fixing the
// tie-break here fixes both.
//
// The aggregation + bulkWrite below is real work (a collection-wide scan
// of this week's XPTransactions, then a write)  it used to run on every
// single GET /leaderboard/current, i.e. every user's every visit to the
// Ranks tab, which both mutates data on a read endpoint and gets more
// expensive as transaction volume grows. `force` aside (settling the week
// needs an authoritative up-to-the-second computation), a plain read is
// happy with standings that are at most RECOMPUTE_THROTTLE_MS old.
const RECOMPUTE_THROTTLE_MS = 30_000;

export async function recomputeCurrentLeaderboard(force = false) {
  const board = await getOrCreateCurrentLeaderboard();

  const isFresh = board.entriesRecomputedAt && Date.now() - board.entriesRecomputedAt.getTime() < RECOMPUTE_THROTTLE_MS;
  if (!force && isFresh) {
    return board;
  }

  const totals = await XPTransaction.aggregate([
    { $match: { createdAt: { $gte: board.weekStart, $lt: board.weekEnd } } },
    { $group: { _id: "$user", weeklyXp: { $sum: "$amount" }, reachedAt: { $max: "$createdAt" } } },
    { $match: { weeklyXp: { $gt: 0 } } },
  ]);

  const users = await User.find({ _id: { $in: totals.map((row) => row._id) } }, "name");
  const nameById = new Map(users.map((u) => [String(u._id), u.name]));

  totals.sort((a, b) => {
    if (b.weeklyXp !== a.weeklyXp) return b.weeklyXp - a.weeklyXp;
    const timeDiff = new Date(a.reachedAt).getTime() - new Date(b.reachedAt).getTime();
    if (timeDiff !== 0) return timeDiff;
    const aName = firstName(nameById.get(String(a._id)) ?? "");
    const bName = firstName(nameById.get(String(b._id)) ?? "");
    return aName.localeCompare(bName);
  });

  const bulkOps = totals.map((row, idx) => ({
    updateOne: {
      filter: { leaderboard: board._id, user: row._id },
      update: { $set: { weeklyXp: row.weeklyXp, rank: idx + 1 } },
      upsert: true,
    },
  }));

  if (bulkOps.length > 0) {
    await LeaderboardEntry.bulkWrite(bulkOps);
  }

  board.entriesRecomputedAt = new Date();
  await board.save();

  return board;
}

// Called by a weekly cron job: freezes the current board, pays out the top
// five, notifies winners, and opens a fresh board for the new week.
export async function settleWeeklyLeaderboard() {
  // Payout must reflect an up-to-the-second computation, not whatever the
  // last throttled read happened to cache.
  const board = await recomputeCurrentLeaderboard(true);
  board.status = "frozen";
  await board.save();

  const top5 = await LeaderboardEntry.find({ leaderboard: board._id }).sort({ rank: 1 }).limit(5);

  for (let i = 0; i < top5.length; i++) {
    const entry = top5[i];

    const reward = LEADERBOARD_REWARD_DISTRIBUTION[i] ?? 0;
    if (reward <= 0) continue;

    // eslint-disable-next-line no-await-in-loop
    await awardXpAndCredits(entry.user, 0, reward, "streak", "leaderboard_reward", board._id);
    entry.creditsAwarded = reward;
    // eslint-disable-next-line no-await-in-loop
    await entry.save();

    // Covers any achievement whose metric is leaderboard_top5_finishes 
    // must run after entry.creditsAwarded is persisted, since that's what
    // the metric counts.
    // eslint-disable-next-line no-await-in-loop
    await evaluateAchievements(entry.user, { type: "LEADERBOARD_TOP5" });

    // eslint-disable-next-line no-await-in-loop
    await Notification.create({
      user: entry.user,
      type: "leaderboard_result",
      title: "Week complete!",
      body: `You finished #${entry.rank} this week and earned ${reward.toLocaleString()} Credits.`,
      data: { rank: entry.rank, credits: reward },
    });
  }

  board.status = "settled";
  board.rewardsDistributedAt = new Date();
  await board.save();

  // Next call to getOrCreateCurrentLeaderboard() naturally opens a new week.
  return board;
}
