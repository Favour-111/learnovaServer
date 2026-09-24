import { Router } from "express";
import { getQuiz, submitQuiz, listQuizzes, getMyQuizAttempts, getMyQuizStats } from "../controllers/quizController";
import { requireAuth, attachDbUser, attachDbUserOptional, withAuth } from "../middleware/auth";
import { submissionLimiter } from "../middleware/rateLimiters";
import { validateBody } from "../middleware/validate";
import { quizSubmitSchema } from "../validation/schemas";

const router = Router();

// Specific paths declared before the /:id wildcard so "attempts"/"stats"
// can never be swallowed by it.
router.get("/attempts/me", requireAuth, attachDbUser, getMyQuizAttempts);
router.get("/stats/me", requireAuth, attachDbUser, getMyQuizStats);
router.get("/", withAuth, attachDbUserOptional, listQuizzes);
router.get("/:id", withAuth, attachDbUserOptional, getQuiz);
router.post("/:id/submit", submissionLimiter, requireAuth, attachDbUser, validateBody(quizSubmitSchema), submitQuiz);

export default router;
