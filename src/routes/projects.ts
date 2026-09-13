import { Router } from "express";
import { getProject, submitProject, getProjectAttempts, validateGithubRepo } from "../controllers/projectController";
import { requireAuth, attachDbUser, withAuth, attachDbUserOptional } from "../middleware/auth";

const router = Router();

router.get("/:id", withAuth, attachDbUserOptional, getProject);
router.post("/:id/validate-github", requireAuth, attachDbUser, validateGithubRepo);
router.post("/:id/submit", requireAuth, attachDbUser, submitProject);
router.get("/:id/attempts", requireAuth, attachDbUser, getProjectAttempts);

export default router;
