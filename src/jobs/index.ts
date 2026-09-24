import { registerPushWorker } from "./pushNotifications";
import { registerAchievementsWorker } from "./achievementsRecalculate";
import { isQueueEnabled } from "../services/queue";
import { logger } from "../config/logger";

// Both registrations are no-ops (return null) when REDIS_URL isn't set
// safe to call unconditionally at boot.
export function initJobs() {
  registerPushWorker();
  registerAchievementsWorker();
  if (isQueueEnabled()) {
    logger.info("[jobs] background workers registered (push-notifications, achievements-recalculate-all)");
  }
}
