import { Router } from "express";
import { getCredits, getCreditTransactions } from "../controllers/creditController";
import { requireAuth, attachDbUser } from "../middleware/auth";

const router = Router();

router.get("/", requireAuth, attachDbUser, getCredits);
router.get("/transactions", requireAuth, attachDbUser, getCreditTransactions);

export default router;
