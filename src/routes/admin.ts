import { Router } from "express";
import { Model } from "mongoose";
import { requireAuth, attachDbUser, requireAdmin, AuthedRequest } from "../middleware/auth";
import {
  User,
  Category,
  Course,
  Module,
  Lesson,
  Enrollment,
  Quiz,
  Question,
  Project,
  Achievement,
  Certificate,
  ProjectAttempt,
  ProjectSubmission,
  AIEvaluation,
  Notification,
} from "../models";
import { recomputeCurrentLeaderboard } from "../services/leaderboard";
import { evaluateAchievements } from "../services/achievements";
import { runOrEnqueueRecalculateAll } from "../jobs/achievementsRecalculate";
import { awardXpAndCredits } from "../services/gamification";
import { assistText, TextAssistAction, generateQuizQuestions } from "../services/openai";
import { notifyUsers } from "../services/notify";
import { sendTestPush } from "../services/push";
import { setYouTubeVideo, createUploadUrl, completeUpload, retryProcessing } from "../controllers/videoController";
import { getImageUploadUrl } from "../controllers/uploadController";
import { LeaderboardEntry } from "../models/LeaderboardEntry";
import { adminLimiter, aiLimiter } from "../middleware/rateLimiters";
import { validateBody } from "../middleware/validate";
import { adminRoleChangeSchema } from "../validation/schemas";

const router = Router();

// Every admin route requires a signed-in Clerk session AND role === "admin",
// plus a tighter rate ceiling than ordinary learner traffic (still layered
// under the global /api limiter in app.ts).
router.use(requireAuth, attachDbUser, requireAdmin, adminLimiter);

const ADMIN_DEFAULT_LIMIT = 200;
const ADMIN_MAX_LIMIT = 200;

// Shared by every admin list endpoint below. Omitting page/limit keeps
// today's exact behavior (a flat top-200, no page/total in the response)
// so no existing admin-panel call breaks; passing either opts into real
// skip/limit paging with a total count alongside the items.
export function adminPageParams(req: { query: Record<string, unknown> }) {
  const { page, limit } = req.query as { page?: string; limit?: string };
  const isPaginated = page != null || limit != null;
  const pageSize = Math.min(Math.max(Number(limit) || ADMIN_DEFAULT_LIMIT, 1), ADMIN_MAX_LIMIT);
  const pageNumber = Math.max(Number(page) || 1, 1);
  return { isPaginated, pageSize, pageNumber };
}

export function adminPageMeta(isPaginated: boolean, pageNumber: number, pageSize: number, total: number | undefined) {
  return isPaginated ? { page: pageNumber, limit: pageSize, total, hasMore: pageNumber * pageSize < (total ?? 0) } : {};
}

// Express 4 doesn't forward a rejected promise from an async handler to
// next(err) on its own  an uncaught rejection here (e.g. a Mongoose
// ValidationError from a malformed create/update body) crashes the whole
// process instead of just answering the one request with a 400. Every
// handler below is wrapped in try/catch for exactly that reason.
function crud(model: Model<any>) {
  const r = Router();
  r.get("/", async (req, res, next) => {
    try {
      const { isPaginated, pageSize, pageNumber } = adminPageParams(req);
      const query = model.find().sort({ createdAt: -1 }).lean();
      const [items, total] = await Promise.all([
        isPaginated ? query.skip((pageNumber - 1) * pageSize).limit(pageSize) : query.limit(ADMIN_DEFAULT_LIMIT),
        isPaginated ? model.countDocuments() : Promise.resolve(undefined),
      ]);
      res.json({ items, ...adminPageMeta(isPaginated, pageNumber, pageSize, total) });
    } catch (err) {
      next(err);
    }
  });
  r.get("/:id", async (req, res, next) => {
    try {
      const item = await model.findById(req.params.id).lean();
      if (!item) return res.status(404).json({ error: "Not found" });
      res.json({ item });
    } catch (err) {
      next(err);
    }
  });
  r.post("/", async (req, res, next) => {
    try {
      res.status(201).json({ item: await model.create(req.body) });
    } catch (err) {
      next(err);
    }
  });
  r.put("/:id", async (req, res, next) => {
    try {
      const item = await model.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
      if (!item) return res.status(404).json({ error: "Not found" });
      res.json({ item });
    } catch (err) {
      next(err);
    }
  });
  r.delete("/:id", async (req, res, next) => {
    try {
      const item = await model.findByIdAndDelete(req.params.id);
      if (!item) return res.status(404).json({ error: "Not found" });
      res.status(204).send();
    } catch (err) {
      next(err);
    }
  });
  return r;
}

router.use("/categories", crud(Category));
router.use("/courses", crud(Course));
router.use("/modules", crud(Module));
router.use("/lessons", crud(Lesson)); // POST/PUT body includes youtubeUrl -> extract videoId client-side in admin before saving

// Dual Video Source  these live outside crud(Lesson) since they're
// actions, not plain field updates (each has its own validation and, for
// uploads, talks to AWS). See controllers/videoController.ts.
router.post("/lessons/:id/video/youtube", setYouTubeVideo);
router.post("/lessons/:id/video/upload-url", createUploadUrl);
router.post("/lessons/:id/video/upload-complete", completeUpload);
router.post("/lessons/:id/video/retry", retryProcessing);

// PUT /admin/lessons/:id/publish  mirrors /courses/:id/publish below.
// Lives outside crud(Lesson) since flipping isPublished false->true is the
// "new_lesson" notification trigger, not a plain field edit  only users
// already enrolled in the lesson's course get notified.
router.put("/lessons/:id/publish", async (req, res) => {
  const { isPublished } = req.body as { isPublished: boolean };
  const lesson = await Lesson.findById(req.params.id);
  if (!lesson) return res.status(404).json({ error: "Not found" });

  const wasPublished = lesson.isPublished;
  lesson.isPublished = isPublished;
  await lesson.save();

  if (isPublished && !wasPublished) {
    const enrolledUserIds = await Enrollment.find({ course: lesson.course }).distinct("user");
    const course = await Course.findById(lesson.course, "title");
    await notifyUsers(
      enrolledUserIds,
      "new_lesson",
      "New lesson added",
      `A new lesson is available in ${course?.title ?? "your course"}. Continue where you left off.`,
      { lessonId: String(lesson._id), courseId: String(lesson.course) }
    );
  }

  res.json({ lesson });
});

// Generic image upload for Category "Learning Path" artwork and Course
// thumbnails  same presigned-S3 pattern as the video pipeline above, just
// with no transcode step. See controllers/uploadController.ts.
router.post("/uploads/image", getImageUploadUrl);

router.use("/quizzes", crud(Quiz));

async function regenerateQuestions(quizId: unknown, topic: string, count?: number) {
  const questionCount = Math.min(Math.max(Number(count) || 20, 1), 30);
  const generated = await generateQuizQuestions(topic, questionCount);
  if (generated.length === 0) {
    throw new Error("AI did not return any usable questions  try rephrasing the topic.");
  }

  await Question.deleteMany({ quiz: quizId });
  return Question.insertMany(
    generated.map((q, order) => ({
      quiz: quizId,
      type: q.type,
      prompt: q.prompt,
      options: q.options,
      correctOptionIndex: q.correctOptionIndex,
      correctBoolean: q.correctBoolean,
      explanation: q.explanation,
      order,
    }))
  );
}

// POST /api/admin/quizzes/:id/generate-questions  replaces this quiz's
// question set with a fresh AI-generated one from a short topic description.
// Lives outside crud(Quiz) since it's an action (and talks to OpenAI), not a
// plain field update.
router.post("/quizzes/:id/generate-questions", aiLimiter, async (req, res) => {
  const quiz = await Quiz.findById(req.params.id);
  if (!quiz) return res.status(404).json({ error: "Quiz not found" });

  const { topic, count } = req.body as { topic?: string; count?: number };
  if (typeof topic !== "string" || !topic.trim()) {
    return res.status(400).json({ error: "topic is required" });
  }

  try {
    const questions = await regenerateQuestions(quiz._id, topic, count);
    res.json({ questions });
  } catch (err) {
    res.status(502).json({ error: err instanceof Error ? err.message : "AI request failed" });
  }
});

// POST /api/admin/modules/:id/generate-quiz  the one-step "describe the
// module, get a full quiz" flow: creates the module's quiz if it doesn't
// have one yet (reuses it if it does), then (re)generates its questions.
// Lets an admin go straight from a module to a ready quiz without first
// having to manually create an empty Quiz row.
router.post("/modules/:id/generate-quiz", aiLimiter, async (req, res) => {
  const mod = await Module.findById(req.params.id);
  if (!mod) return res.status(404).json({ error: "Module not found" });

  const { topic, count, title } = req.body as { topic?: string; count?: number; title?: string };
  if (typeof topic !== "string" || !topic.trim()) {
    return res.status(400).json({ error: "topic is required" });
  }

  try {
    let quiz = await Quiz.findOne({ module: mod._id });
    if (!quiz) {
      quiz = await Quiz.create({
        module: mod._id,
        course: mod.course,
        title: title?.trim() || `${mod.title} Quiz`,
        xpReward: 50,
        creditReward: 20,
        passingScorePercent: 70,
      });
    }

    const questions = await regenerateQuestions(quiz._id, topic, count);
    res.json({ quiz, questions });
  } catch (err) {
    res.status(502).json({ error: err instanceof Error ? err.message : "AI request failed" });
  }
});

router.use("/questions", crud(Question));
router.use("/projects", crud(Project)); // body.rubric is the configurable per-project weighting
router.use("/achievements", crud(Achievement));

// POST /admin/achievements/recalculate-all  re-evaluates every active
// achievement against every user's real current state. Meant to be run
// once after adding a new achievement (or changing an existing one's
// requirement) so existing users who already qualify get unlocked/rewarded
// immediately instead of waiting for their next learning action.
// With REDIS_URL configured this runs as a background job and responds
// immediately ({queued: true}); without it, runs the identical per-user
// loop synchronously and responds with the same {usersProcessed,
// achievementsUnlocked} shape this endpoint always has.
router.post("/achievements/recalculate-all", async (req, res, next) => {
  try {
    const result = await runOrEnqueueRecalculateAll();
    res.json(result);
  } catch (err) {
    next(err);
  }
});

router.get("/users", async (req, res) => {
  const { isPaginated, pageSize, pageNumber } = adminPageParams(req);
  const query = User.find().sort({ createdAt: -1 }).lean();
  const [users, total] = await Promise.all([
    isPaginated ? query.skip((pageNumber - 1) * pageSize).limit(pageSize) : query.limit(ADMIN_DEFAULT_LIMIT),
    isPaginated ? User.countDocuments() : Promise.resolve(undefined),
  ]);
  res.json({ users, ...adminPageMeta(isPaginated, pageNumber, pageSize, total) });
});

// findByIdAndUpdate doesn't run schema validators by default (that's opt-in
// via runValidators), so without this the enum on User.role was never
// actually enforced here  validateBody is what stops an arbitrary string
// from being written straight to the DB.
router.put("/users/:id/role", validateBody(adminRoleChangeSchema), async (req, res) => {
  const { role } = req.body as { role: "user" | "admin" };
  const user = await User.findByIdAndUpdate(req.params.id, { role }, { new: true });
  if (!user) return res.status(404).json({ error: "Not found" });
  res.json({ user });
});

// GET /admin/submissions?project=<id>&status=passed|failed  the project
// param scopes this to "submissions for one project" (section 15's "View
// submissions"); status=passed/failed further scopes to
// "View passed/failed projects" without needing separate routes.
router.get("/submissions", async (req, res, next) => {
  try {
    const { project, status } = req.query as { project?: string; status?: "passed" | "failed" };
    const filter: Record<string, unknown> = {};
    if (project) filter.project = project;
    if (status) filter.status = "evaluated";

    let submissions = await ProjectSubmission.find(filter)
      .sort({ createdAt: -1 })
      .limit(200)
      .populate("user", "name email")
      .populate("project", "title passingScore")
      .populate({ path: "currentAttempt" })
      .lean();

    if (status) {
      submissions = submissions.filter((s) => {
        const attempt = s.currentAttempt as unknown as { passed?: boolean } | null;
        return attempt && (status === "passed" ? attempt.passed : !attempt.passed);
      });
    }

    res.json({ submissions });
  } catch (err) {
    next(err);
  }
});

// GET /admin/submissions/:id  full detail for the admin review screen:
// student, project, the evaluated commit, automated checks, AI evaluation,
// requirement verification, and this student's full attempt history on
// this project (so admin can see the progression across resubmissions).
router.get("/submissions/:id", async (req, res, next) => {
  try {
    const submission = await ProjectSubmission.findById(req.params.id)
      .populate("user", "name email avatarUrl")
      .populate("project")
      .populate({ path: "currentAttempt", populate: { path: "evaluation" } })
      .lean();
    if (!submission) return res.status(404).json({ error: "Not found" });

    const attemptHistory = await ProjectAttempt.find({ user: submission.user, project: submission.project })
      .sort({ attemptNumber: 1 })
      .populate("evaluation")
      .lean();

    res.json({ submission, attemptHistory });
  } catch (err) {
    next(err);
  }
});

// POST /admin/submissions/:id/override  manual override of an evaluation
// result, with a required reason (section 16). Updates both the audit
// trail on the submission and the attempt itself (so every other view of
// this attempt reflects the override)  flipping a fail into a pass also
// runs the same idempotent reward/achievement path a normal pass would,
// so the student isn't shorted XP/credits just because a human corrected
// the AI's read. Flipping a pass into a fail does NOT claw back any reward
// already paid out  that reversal isn't implemented.
router.post("/submissions/:id/override", async (req: AuthedRequest, res, next) => {
  try {
    const { overriddenScore, overriddenPassed, note } = req.body as {
      overriddenScore?: number;
      overriddenPassed?: boolean;
      note?: string;
    };
    if (!note || !note.trim()) {
      return res.status(400).json({ error: "A reason is required to override an evaluation." });
    }
    if (typeof overriddenPassed !== "boolean") {
      return res.status(400).json({ error: "overriddenPassed (true/false) is required." });
    }

    const submission = await ProjectSubmission.findById(req.params.id).populate<{ currentAttempt: InstanceType<typeof ProjectAttempt> | null }>(
      "currentAttempt"
    );
    if (!submission) return res.status(404).json({ error: "Not found" });
    const attempt = submission.currentAttempt;
    if (!attempt) return res.status(400).json({ error: "This submission has no evaluated attempt to override." });

    const wasPassed = attempt.passed;
    attempt.passed = overriddenPassed;
    if (typeof overriddenScore === "number") attempt.score = overriddenScore;
    await attempt.save();

    submission.adminReview = {
      reviewed: true,
      note,
      overriddenScore,
      overriddenPassed,
      reviewedBy: req.dbUser!._id,
      reviewedAt: new Date(),
    };
    await submission.save();

    // Newly passed by override  same idempotency guard as a normal pass
    // (a user who already passed a prior attempt gets nothing here either).
    if (overriddenPassed && !wasPassed) {
      const project = await Project.findById(submission.project);
      const alreadyPassedBefore = await ProjectAttempt.exists({
        user: submission.user,
        project: submission.project,
        passed: true,
        _id: { $ne: attempt._id },
      });
      if (project && !alreadyPassedBefore) {
        const xpAwarded = project.xpReward;
        const creditsAwarded = project.creditReward;
        if (xpAwarded > 0 || creditsAwarded > 0) {
          await awardXpAndCredits(submission.user, xpAwarded, creditsAwarded, "project", "project", submission.project);
          attempt.xpAwarded = xpAwarded;
          attempt.creditsAwarded = creditsAwarded;
          await attempt.save();
        }
        await evaluateAchievements(submission.user, { type: "PROJECT_SUBMITTED" });
      }
    }

    res.json({ submission, attempt });
  } catch (err) {
    next(err);
  }
});

router.get("/evaluations", async (req, res) => {
  const { isPaginated, pageSize, pageNumber } = adminPageParams(req);
  const query = AIEvaluation.find().sort({ createdAt: -1 }).populate("projectAttempt").lean();
  const [evaluations, total] = await Promise.all([
    isPaginated ? query.skip((pageNumber - 1) * pageSize).limit(pageSize) : query.limit(ADMIN_DEFAULT_LIMIT),
    isPaginated ? AIEvaluation.countDocuments() : Promise.resolve(undefined),
  ]);
  res.json({ evaluations, ...adminPageMeta(isPaginated, pageNumber, pageSize, total) });
});

router.get("/certificates", async (req, res) => {
  const { isPaginated, pageSize, pageNumber } = adminPageParams(req);
  const query = Certificate.find().sort({ createdAt: -1 }).populate("user", "name email").lean();
  const [certificates, total] = await Promise.all([
    isPaginated ? query.skip((pageNumber - 1) * pageSize).limit(pageSize) : query.limit(ADMIN_DEFAULT_LIMIT),
    isPaginated ? Certificate.countDocuments() : Promise.resolve(undefined),
  ]);
  res.json({ certificates, ...adminPageMeta(isPaginated, pageNumber, pageSize, total) });
});

// This global (cross-user) listing is what the {createdAt:-1} index on
// Notification powers  the per-user {user,createdAt} compound index doesn't
// help an unscoped query like this one.
router.get("/notifications", async (req, res) => {
  const { isPaginated, pageSize, pageNumber } = adminPageParams(req);
  const query = Notification.find().sort({ createdAt: -1 }).populate("user", "name email").lean();
  const [notifications, total] = await Promise.all([
    isPaginated ? query.skip((pageNumber - 1) * pageSize).limit(pageSize) : query.limit(ADMIN_DEFAULT_LIMIT),
    isPaginated ? Notification.countDocuments() : Promise.resolve(undefined),
  ]);
  res.json({ notifications, ...adminPageMeta(isPaginated, pageNumber, pageSize, total) });
});

// DELETE /admin/notifications/:id  admin can delete any user's notification
// (unlike the learner-facing DELETE /api/notifications/:id, which is scoped
// to req.dbUser's own notifications).
router.delete("/notifications/:id", async (req, res) => {
  const notification = await Notification.findByIdAndDelete(req.params.id);
  if (!notification) return res.status(404).json({ error: "Not found" });
  res.status(204).send();
});

router.get("/leaderboard", async (req, res) => {
  const board = await recomputeCurrentLeaderboard();
  const entries = await LeaderboardEntry.find({ leaderboard: board._id }).sort({ rank: 1 }).limit(50).populate("user", "name email").lean();
  res.json({ board, entries });
});

router.put("/courses/:id/publish", async (req, res) => {
  const { isPublished } = req.body as { isPublished: boolean };
  const existing = await Course.findById(req.params.id, "isPublished").lean();
  if (!existing) return res.status(404).json({ error: "Not found" });
  const wasPublished = existing.isPublished;

  const course = await Course.findByIdAndUpdate(req.params.id, { isPublished }, { new: true });
  if (!course) return res.status(404).json({ error: "Not found" });

  if (isPublished && !wasPublished) {
    const allUserIds = await User.find().distinct("_id");
    await notifyUsers(
      allUserIds,
      "new_course",
      "New course available",
      `${course.title} has just been added to Learnova. Start learning today.`,
      { courseId: String(course._id) }
    );
  }

  res.json({ course });
});

// POST /admin/announcements  a one-off broadcast to every user (feature
// releases, events, maintenance windows). No separate "Announcement"
// entity: the per-user Notification docs this creates are the record,
// same as every other notification type in this system.
router.post("/announcements", async (req, res) => {
  const { title, body } = req.body as { title?: string; body?: string };
  if (!title?.trim() || !body?.trim()) {
    return res.status(400).json({ error: "title and body are required" });
  }

  const allUserIds = await User.find().distinct("_id");
  await notifyUsers(allUserIds, "announcement", title.trim(), body.trim());

  res.status(201).json({ notifiedCount: allUserIds.length });
});

// GET /api/admin/dashboard  top-line stats for the admin home screen.
router.get("/dashboard", async (req, res) => {
  const [userCount, courseCount, publishedCourseCount, certificateCount, projectAttempts] = await Promise.all([
    User.countDocuments(),
    Course.countDocuments(),
    Course.countDocuments({ isPublished: true }),
    Certificate.countDocuments(),
    ProjectAttempt.countDocuments(),
  ]);
  res.json({ userCount, courseCount, publishedCourseCount, certificateCount, projectAttempts });
});

const TEXT_ASSIST_ACTIONS: TextAssistAction[] = ["rewrite", "complete", "shorten", "lengthen"];

// POST /api/admin/ai/assist  the rewrite/complete/shorten/lengthen button
// on admin text fields. Admin-only (this router's blanket requireAdmin),
// separate from the learner-facing /api/ai/* routes.
router.post("/ai/assist", aiLimiter, async (req, res) => {
  const { text, action } = req.body as { text?: string; action?: string };
  if (typeof text !== "string" || !text.trim()) {
    return res.status(400).json({ error: "text is required" });
  }
  if (!TEXT_ASSIST_ACTIONS.includes(action as TextAssistAction)) {
    return res.status(400).json({ error: `action must be one of: ${TEXT_ASSIST_ACTIONS.join(", ")}` });
  }

  try {
    const result = await assistText(text, action as TextAssistAction);
    res.json({ result });
  } catch (err) {
    res.status(502).json({ error: err instanceof Error ? err.message : "AI request failed" });
  }
});

// POST /admin/debug/test-push  temporary diagnostic for the "notification
// saved but never displayed on the phone" problem: sends to exactly ONE
// token (bypass all business logic/preferences) and waits for Expo's real
// delivery receipt before responding, so the ticket/receipt distinction
// (accepted-into-queue vs actually-delivered) is visible in one response
// instead of requiring a log dig. Admin-only (this router's blanket guard)
// and additionally refuses to run at all outside development, so it can
// never be reachable in a production deploy.
router.post("/debug/test-push", async (req, res, next) => {
  if (process.env.NODE_ENV === "production") {
    return res.status(404).json({ error: "Not found" });
  }
  try {
    const { token, title, body } = req.body as { token?: string; title?: string; body?: string };
    if (!token) return res.status(400).json({ error: "token is required  the raw Expo push token, e.g. ExponentPushToken[...]" });
    const result = await sendTestPush(token, title || "Learnova Test", body || "FCM notification test successful.");
    res.json(result);
  } catch (err) {
    next(err);
  }
});

export default router;
