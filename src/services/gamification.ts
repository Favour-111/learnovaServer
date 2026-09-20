import { Types } from "mongoose";
import { User } from "../models/User";
import { XPTransaction, XPSource } from "../models/XPTransaction";
import { CreditTransaction, CreditSource } from "../models/CreditTransaction";
import { Notification } from "../models/Notification";
import { levelForXp } from "../config/gamification";
import { emitUserUpdate } from "./realtime";

interface AwardResult {
  xpAwarded: number;
  creditsAwarded: number;
  newXp: number;
  newCredits: number;
  leveledUp: boolean;
  newLevel: number;
}

// The single choke point for every XP/Credit grant in the system. Anything
// that rewards the user must go through here so balances, transaction
// history, and level-up detection stay consistent  never mutate
// user.xp / user.credits directly anywhere else.
export async function awardXpAndCredits(
  userId: Types.ObjectId,
  xpAmount: number,
  creditAmount: number,
  xpSource: XPSource,
  creditSource: CreditSource,
  sourceRefId?: Types.ObjectId
): Promise<AwardResult> {
  // Atomic increment instead of read-modify-write. The old
  // findById -> mutate in JS -> save() sequence lost updates under
  // concurrency: two overlapping grants for the same user (two quick
  // streak-restore taps, a retried request racing the original, two
  // lessons completing back-to-back) could both read the same starting
  // xp/credits, and whichever save() finished last silently clobbered the
  // other's delta. `$inc` is applied atomically by MongoDB no matter how
  // many requests overlap, and `{ new: false }` hands back the exact
  // pre-image this call's own delta was applied to, so the before/after
  // math below stays correct per-call even under concurrency.
  const previousUser = await User.findByIdAndUpdate(userId, { $inc: { xp: xpAmount, credits: creditAmount } }, { new: false });
  if (!previousUser) throw new Error("User not found");

  const newXp = previousUser.xp + xpAmount;
  const newCredits = previousUser.credits + creditAmount;

  const previousLevel = levelForXp(previousUser.xp).level;
  const newLevelInfo = levelForXp(newXp);
  const leveledUp = newLevelInfo.level > previousLevel;

  if (leveledUp) {
    // Guarded so an out-of-order write from a second, higher concurrent
    // level-up can never get overwritten back down by this one.
    await User.updateOne({ _id: userId, level: { $lt: newLevelInfo.level } }, { $set: { level: newLevelInfo.level } });
  }

  if (xpAmount !== 0) {
    await XPTransaction.create({
      user: userId,
      amount: xpAmount,
      source: xpSource,
      sourceRefId,
      balanceAfter: newXp,
    });
  }

  if (creditAmount !== 0) {
    await CreditTransaction.create({
      user: userId,
      amount: creditAmount,
      source: creditSource,
      sourceRefId,
      balanceAfter: newCredits,
    });
  }

  if (leveledUp) {
    await Notification.create({
      user: userId,
      type: "level_up",
      title: "Level up!",
      body: `You reached Level ${newLevelInfo.level}  ${newLevelInfo.title}.`,
      data: { level: newLevelInfo.level },
    });
  }

  emitUserUpdate(String(userId), xpSource);

  return {
    xpAwarded: xpAmount,
    creditsAwarded: creditAmount,
    newXp,
    newCredits,
    leveledUp,
    newLevel: newLevelInfo.level,
  };
}
