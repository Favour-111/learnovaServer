import { Router } from "express";
import {
  listAchievements,
  listMyAchievements,
  listMyCompletedAchievements,
  getAchievement,
  recalculateMyAchievements,
} from "../controllers/achievementController";
import { withAuth, attachDbUserOptional, attachDbUser } from "../middleware/auth";

const router = Router();

// Order matters  /me and /me/completed must resolve before the generic
// /:id route below, or "me" would be parsed as an achievement id.
router.get("/me/completed", withAuth, attachDbUser, listMyCompletedAchievements);
router.post("/me/recalculate", withAuth, attachDbUser, recalculateMyAchievements);
router.get("/me", withAuth, attachDbUser, listMyAchievements);
router.get("/:id", withAuth, attachDbUserOptional, getAchievement);
router.get("/", withAuth, attachDbUserOptional, listAchievements);

export default router;
