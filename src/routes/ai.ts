import { Router } from "express";
import { tutorAsk, careerRecommendation } from "../controllers/aiController";
import { requireAuth, attachDbUser } from "../middleware/auth";

const router = Router();

router.post("/tutor", requireAuth, attachDbUser, tutorAsk);
router.get("/career-recommendation", requireAuth, attachDbUser, careerRecommendation);

export default router;
