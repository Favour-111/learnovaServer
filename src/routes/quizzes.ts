import { Router } from "express";
import { getQuiz, submitQuiz } from "../controllers/quizController";
import { requireAuth, attachDbUser, withAuth } from "../middleware/auth";

const router = Router();

router.get("/:id", withAuth, getQuiz);
router.post("/:id/submit", requireAuth, attachDbUser, submitQuiz);

export default router;
