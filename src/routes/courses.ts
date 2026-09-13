import { Router } from "express";
import {
  listCourses,
  listMyCourses,
  listSavedCourses,
  getCourse,
  enrollInCourse,
  purchaseCourse,
  toggleSaveCourse,
} from "../controllers/courseController";
import { withAuth, requireAuth, attachDbUser, attachDbUserOptional } from "../middleware/auth";

const router = Router();

router.get("/", withAuth, attachDbUserOptional, listCourses);
router.get("/my", requireAuth, attachDbUser, listMyCourses);
router.get("/saved", requireAuth, attachDbUser, listSavedCourses);
router.get("/:id", withAuth, attachDbUserOptional, getCourse);
router.post("/:id/enroll", requireAuth, attachDbUser, enrollInCourse);
router.post("/:id/purchase", requireAuth, attachDbUser, purchaseCourse);
router.put("/:id/save", requireAuth, attachDbUser, toggleSaveCourse);

export default router;
