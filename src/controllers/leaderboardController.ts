import { Response } from "express";
import { LeaderboardEntry } from "../models/LeaderboardEntry";
import { Leaderboard } from "../models/Leaderboard";
import { User } from "../models/User";
import { AuthedRequest } from "../middleware/auth";
import { recomputeCurrentLeaderboard } from "../services/leaderboard";
import { LEADERBOARD_REWARD_DISTRIBUTION } from "../config/gamification";

function firstName(fullName: string): string {
  return fullName.trim().split(/\s+/)[0] ?? fullName;
}

export async function getCurrentLeaderboard(req: AuthedRequest, res: Response) {
  const board = await recomputeCurrentLeaderboard();

  const entries = await LeaderboardEntry.find({ leaderboard: board._id })
    .sort({ rank: 1 })
    .limit(50)
    .populate("user", "name avatarUrl");

  // The board is still active, so nothing has actually been paid out yet
  // (creditsAwarded stays 0 until settleWeeklyLeaderboard runs at week end) —
  // this is what each rank WOULD earn if the week ended right now.
  const top = entries.map((entry) => ({
    ...entry.toObject(),
    projectedReward: LEADERBOARD_REWARD_DISTRIBUTION[entry.rank - 1] ?? 0,
  }));

  let me = null;
  if (req.dbUser) {
    const myEntry = await LeaderboardEntry.findOne({ leaderboard: board._id, user: req.dbUser._id });
    if (myEntry) {
      const nextAbove = await LeaderboardEntry.findOne({
        leaderboard: board._id,
        rank: myEntry.rank - 1,
      }).populate("user", "name");
      me = {
        rank: myEntry.rank,
        weeklyXp: myEntry.weeklyXp,
        xpToNextRank: nextAbove ? Math.max(0, nextAbove.weeklyXp - myEntry.weeklyXp) : 0,
      };
    }
  }

  // Everyone else — no XP this week, so no competitive rank (never a fake
  // #4/#5/etc for sitting at 0). Still shown, just unranked, ordered
  // deterministically by first name rather than left to whatever order
  // they happen to come back in.
  const rankedUserIds = entries.map((entry) => entry.user);
  const unrankedUsers = await User.find({ role: "user", _id: { $nin: rankedUserIds } }, "name avatarUrl").limit(100);
  const unranked = unrankedUsers
    .map((u) => ({ _id: u._id, name: u.name, avatarUrl: u.avatarUrl }))
    .sort((a, b) => firstName(a.name).localeCompare(firstName(b.name)));

  res.json({ board, top, me, unranked });
}

export async function getLeaderboardHistory(req: AuthedRequest, res: Response) {
  const boards = await Leaderboard.find({ status: "settled" }).sort({ weekStart: -1 }).limit(20);
  res.json({ boards });
}

export async function getLeaderboardForWeek(req: AuthedRequest, res: Response) {
  const board = await Leaderboard.findById(req.params.id);
  if (!board) return res.status(404).json({ error: "Leaderboard not found" });
  const entries = await LeaderboardEntry.find({ leaderboard: board._id }).sort({ rank: 1 }).limit(50).populate("user", "name avatarUrl");
  res.json({ board, entries });
}
