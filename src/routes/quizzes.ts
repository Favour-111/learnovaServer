import { Router } from "express";
import { getQuiz, submitQuiz, listQuizzes, getMyQuizAttempts, getMyQuizStats } from "../controllers/quizController";
import { requireAuth, attachDbUser, attachDbUserOptional, withAuth } from "../middleware/auth";

const router = Router();

// Specific paths declared before the /:id wildcard so "attempts"/"stats"
// can never be swallowed by it.
router.get("/attempts/me", requireAuth, attachDbUser, getMyQuizAttempts);
router.get("/stats/me", requireAuth, attachDbUser, getMyQuizStats);
router.get("/", withAuth, attachDbUserOptional, listQuizzes);
router.get("/:id", withAuth, attachDbUserOptional, getQuiz);
router.post("/:id/submit", requireAuth, attachDbUser, submitQuiz);

export default router;
