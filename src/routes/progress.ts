import { Router } from "express";
import { getProgress, getDailyGoal, restoreStreak } from "../controllers/progressController";
import { requireAuth, attachDbUser } from "../middleware/auth";

const router = Router();

router.get("/", requireAuth, attachDbUser, getProgress);
router.get("/daily-goal", requireAuth, attachDbUser, getDailyGoal);
router.post("/restore-streak", requireAuth, attachDbUser, restoreStreak);

export default router;
