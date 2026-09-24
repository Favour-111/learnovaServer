import { Response } from "express";
import { LeaderboardEntry } from "../models/LeaderboardEntry";
import { Leaderboard } from "../models/Leaderboard";
import { User } from "../models/User";
import { AuthedRequest } from "../middleware/auth";
import { recomputeCurrentLeaderboard } from "../services/leaderboard";
import { LEADERBOARD_REWARD_DISTRIBUTION } from "../config/gamification";
import { getOrSetCache } from "../services/cache";

function firstName(fullName: string): string {
  return fullName.trim().split(/\s+/)[0] ?? fullName;
}

// 30s to match recomputeCurrentLeaderboard's own in-process throttle below
// (no point caching this layer any longer than the data underneath it can
// actually change). Keyed by board._id, not a fixed string, so the weekly
// rollover to a new board is a natural cache miss  no explicit invalidation
// needed for that case.
const LEADERBOARD_CACHE_TTL_SECONDS = 30;

// All reads in this controller are display-only (nothing fetched here is
// ever .save()'d), so every query below is .lean()  a plain object straight
// off the wire instead of a full hydrated Mongoose document.
export async function getCurrentLeaderboard(req: AuthedRequest, res: Response) {
  const board = await recomputeCurrentLeaderboard();

  // Cached WITHOUT `me`  that's computed live below from req.dbUser, so
  // this entry is shared across every viewer of the current board
  // regardless of who's asking.
  const { top, unranked } = await getOrSetCache(`leaderboard:current:${board._id}`, LEADERBOARD_CACHE_TTL_SECONDS, async () => {
    const entries = await LeaderboardEntry.find({ leaderboard: board._id })
      .sort({ rank: 1 })
      .limit(50)
      .populate("user", "name avatarUrl avatarSeed")
      .lean();

    // The board is still active, so nothing has actually been paid out yet
    // (creditsAwarded stays 0 until settleWeeklyLeaderboard runs at week
    // end)  this is what each rank WOULD earn if the week ended right now.
    const top = entries.map((entry) => ({
      ...entry,
      projectedReward: LEADERBOARD_REWARD_DISTRIBUTION[entry.rank - 1] ?? 0,
    }));

    // Everyone else  no XP this week, so no competitive rank (never a fake
    // #4/#5/etc for sitting at 0). Still shown, just unranked, ordered
    // deterministically by first name rather than left to whatever order
    // they happen to come back in.
    // entry.user is populated (a {_id,name,...} object, not a raw ObjectId)
    //  explicitly pull ._id rather than passing the populated object
    // itself into $nin below.
    const rankedUserIds = entries.map((entry) => (entry.user as unknown as { _id: unknown })?._id).filter(Boolean);
    const unrankedUsers = await User.find({ role: "user", _id: { $nin: rankedUserIds } }, "name avatarUrl avatarSeed").limit(100).lean();
    const unranked = unrankedUsers
      .map((u) => ({ _id: u._id, name: u.name, avatarUrl: u.avatarUrl, avatarSeed: u.avatarSeed }))
      .sort((a, b) => firstName(a.name).localeCompare(firstName(b.name)));

    return { top, unranked };
  });

  let me = null;
  if (req.dbUser) {
    const myEntry = await LeaderboardEntry.findOne({ leaderboard: board._id, user: req.dbUser._id }).lean();
    if (myEntry) {
      const nextAbove = await LeaderboardEntry.findOne({
        leaderboard: board._id,
        rank: myEntry.rank - 1,
      })
        .populate("user", "name")
        .lean();
      me = {
        rank: myEntry.rank,
        weeklyXp: myEntry.weeklyXp,
        xpToNextRank: nextAbove ? Math.max(0, nextAbove.weeklyXp - myEntry.weeklyXp) : 0,
      };
    }
  }

  res.json({ board, top, me, unranked });
}

export async function getLeaderboardHistory(req: AuthedRequest, res: Response) {
  const boards = await Leaderboard.find({ status: "settled" }).sort({ weekStart: -1 }).limit(20).lean();
  res.json({ boards });
}

export async function getLeaderboardForWeek(req: AuthedRequest, res: Response) {
  const board = await Leaderboard.findById(req.params.id).lean();
  if (!board) return res.status(404).json({ error: "Leaderboard not found" });
  const entries = await LeaderboardEntry.find({ leaderboard: board._id })
    .sort({ rank: 1 })
    .limit(50)
    .populate("user", "name avatarUrl avatarSeed")
    .lean();
  res.json({ board, entries });
}
