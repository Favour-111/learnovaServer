import { Router } from "express";
import { tutorAsk, careerRecommendation } from "../controllers/aiController";
import { requireAuth, attachDbUser } from "../middleware/auth";
import { aiLimiter } from "../middleware/rateLimiters";

const router = Router();

router.post("/tutor", aiLimiter, requireAuth, attachDbUser, tutorAsk);
router.get("/career-recommendation", aiLimiter, requireAuth, attachDbUser, careerRecommendation);

export default router;
