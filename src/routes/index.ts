import { Router } from "express";
import auth from "./auth";
import courses from "./courses";
import lessons from "./lessons";
import progress from "./progress";
import quizzes from "./quizzes";
import projects from "./projects";
import submissions from "./submissions";
import ai from "./ai";
import xp from "./xp";
import credits from "./credits";
import leaderboard from "./leaderboard";
import certificates from "./certificates";
import notifications from "./notifications";
import achievements from "./achievements";
import admin from "./admin";
import webhooks from "./webhooks";

const router = Router();

router.use("/auth", auth);
router.use("/courses", courses);
router.use("/lessons", lessons);
router.use("/progress", progress);
router.use("/quizzes", quizzes);
router.use("/projects", projects);
router.use("/submissions", submissions);
router.use("/ai", ai);
router.use("/xp", xp);
router.use("/credits", credits);
router.use("/leaderboard", leaderboard);
router.use("/certificates", certificates);
router.use("/notifications", notifications);
router.use("/achievements", achievements);
router.use("/admin", admin);
router.use("/webhooks", webhooks);

export default router;
