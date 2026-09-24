import { Router } from "express";
import { getProject, submitProject, getProjectAttempts, validateGithubRepo } from "../controllers/projectController";
import { requireAuth, attachDbUser, withAuth, attachDbUserOptional } from "../middleware/auth";
import { submissionLimiter } from "../middleware/rateLimiters";
import { validateBody } from "../middleware/validate";
import { projectSubmitSchema, validateGithubSchema } from "../validation/schemas";

const router = Router();

router.get("/:id", withAuth, attachDbUserOptional, getProject);
router.post("/:id/validate-github", submissionLimiter, requireAuth, attachDbUser, validateBody(validateGithubSchema), validateGithubRepo);
router.post("/:id/submit", submissionLimiter, requireAuth, attachDbUser, validateBody(projectSubmitSchema), submitProject);
router.get("/:id/attempts", requireAuth, attachDbUser, getProjectAttempts);

export default router;
