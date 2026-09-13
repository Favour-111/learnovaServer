import { Router } from "express";
import { getXp, getXpHistory } from "../controllers/xpController";
import { requireAuth, attachDbUser } from "../middleware/auth";

const router = Router();

router.get("/", requireAuth, attachDbUser, getXp);
router.get("/history", requireAuth, attachDbUser, getXpHistory);

export default router;
