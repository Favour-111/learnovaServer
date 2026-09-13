import { Router } from "express";
import { getSubmission } from "../controllers/projectController";
import { requireAuth, attachDbUser } from "../middleware/auth";

const router = Router();

router.get("/:id", requireAuth, attachDbUser, getSubmission);

export default router;
