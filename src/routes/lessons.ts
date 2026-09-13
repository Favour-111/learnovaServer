import { Router } from "express";
import { getLesson, completeLesson, toggleBookmark, updateLessonProgress } from "../controllers/lessonController";
import { getPlaybackUrl } from "../controllers/videoController";
import { withAuth, requireAuth, attachDbUser, attachDbUserOptional } from "../middleware/auth";

const router = Router();

router.get("/:id", withAuth, attachDbUserOptional, getLesson);
router.put("/:id/complete", requireAuth, attachDbUser, completeLesson);
router.put("/:id/bookmark", requireAuth, attachDbUser, toggleBookmark);
router.put("/:id/progress", requireAuth, attachDbUser, updateLessonProgress);
router.get("/:id/video/playback-url", requireAuth, attachDbUser, getPlaybackUrl);

export default router;
