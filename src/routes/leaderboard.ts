import { Router } from "express";
import { getCurrentLeaderboard, getLeaderboardHistory, getLeaderboardForWeek } from "../controllers/leaderboardController";
import { withAuth, attachDbUserOptional } from "../middleware/auth";

const router = Router();

router.get("/current", withAuth, attachDbUserOptional, getCurrentLeaderboard);
router.get("/history", withAuth, getLeaderboardHistory);
router.get("/history/:id", withAuth, getLeaderboardForWeek);

export default router;
