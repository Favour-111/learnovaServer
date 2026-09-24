import { getQueue, registerWorker } from "../services/queue";
import { recalculateUserAchievements } from "../services/achievements";
import { User } from "../models/User";
import { logger } from "../config/logger";

const QUEUE_NAME = "achievements-recalculate-all";

// admin/achievements/recalculate-all currently blocks the HTTP request on a
// sequential per-user loop  fine for a handful of users, a real problem
// once the user base grows (exactly the "1,000 -> 10,000 -> 100,000" curve
// this whole pass is meant to prepare for). With Redis configured this
// enqueues one job and returns immediately; without it, runs the identical
// loop synchronously and returns the same {usersProcessed,
// achievementsUnlocked} shape the admin panel already expects today  the
// response shape only changes when Redis is actually configured, which is
// an explicit infrastructure upgrade the operator opted into.
export async function runOrEnqueueRecalculateAll(): Promise<{ queued: boolean; usersProcessed?: number; achievementsUnlocked?: number }> {
  const queue = getQueue(QUEUE_NAME);
  if (queue) {
    await queue.add("recalculate-all", {});
    return { queued: true };
  }

  const userIds = await User.find().distinct("_id");
  let unlockedCount = 0;
  for (const userId of userIds) {
    // eslint-disable-next-line no-await-in-loop
    const unlocked = await recalculateUserAchievements(userId);
    unlockedCount += unlocked.length;
  }
  return { queued: false, usersProcessed: userIds.length, achievementsUnlocked: unlockedCount };
}

export function registerAchievementsWorker() {
  return registerWorker(QUEUE_NAME, async () => {
    const userIds = await User.find().distinct("_id");
    let unlockedCount = 0;
    for (const userId of userIds) {
      // eslint-disable-next-line no-await-in-loop
      const unlocked = await recalculateUserAchievements(userId);
      unlockedCount += unlocked.length;
    }
    logger.info({ usersProcessed: userIds.length, achievementsUnlocked: unlockedCount }, "[jobs] achievements recalculate-all complete");
  });
}
