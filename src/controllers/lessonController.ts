import { Response } from "express";
import { HydratedDocument } from "mongoose";
import { Lesson, ILesson } from "../models/Lesson";
import { Module } from "../models/Module";
import { Quiz } from "../models/Quiz";
import { QuizAttempt } from "../models/QuizAttempt";
import { LessonProgress } from "../models/LessonProgress";
import { Course } from "../models/Course";
import { Enrollment } from "../models/Enrollment";
import { DailyGoal } from "../models/DailyGoal";
import { Notification } from "../models/Notification";
import { IUser } from "../models/User";
import { AuthedRequest } from "../middleware/auth";
import { awardXpAndCredits } from "../services/gamification";
import { issueCertificate } from "../services/certificates";
import { evaluateAchievements, recordDailyActivity, todayStr, UnlockedAchievement } from "../services/achievements";
import { XP_RULES } from "../config/gamification";
import { normalizeLessonVideo } from "../services/video";
import { emitUserUpdate } from "../services/realtime";
import { env } from "../config/env";

// The course's module/lesson ordering, flattened into the single sequence
// a learner actually moves through  Lesson.order is only unique *within*
// its module, so getting a correct global sequence (for prev/next nav and
// the "Lesson 03" breadcrumb) means joining through Module.order too.
// Read-only everywhere it's used (prev/next nav, module/lesson-number
// lookups)  .lean() throughout, and .equals() below still works fine on a
// lean result since _id stays a real ObjectId instance, just not wrapped in
// a full hydrated Document.
async function getFlattenedLessons(courseId: unknown) {
  const [modules, lessons] = await Promise.all([
    Module.find({ course: courseId, isPublished: true }).sort({ order: 1 }).lean(),
    Lesson.find({ course: courseId, isPublished: true }).sort({ order: 1 }).lean(),
  ]);
  return modules.flatMap((mod) => lessons.filter((l) => l.module.equals(mod._id)).map((l) => ({ lesson: l, module: mod })));
}

export async function getLesson(req: AuthedRequest, res: Response) {
  const lesson = await Lesson.findById(req.params.id).lean();
  if (!lesson) return res.status(404).json({ error: "Lesson not found" });

  const [course, flattened] = await Promise.all([Course.findById(lesson.course).lean(), getFlattenedLessons(lesson.course)]);
  const index = flattened.findIndex((f) => f.lesson._id.equals(lesson._id));
  const current = flattened[index];
  const lessonNumberInModule = current
    ? flattened.filter((f) => f.module._id.equals(current.module._id)).findIndex((f) => f.lesson._id.equals(lesson._id)) + 1
    : 1;

  let progress = null;
  let courseProgressPercent = null;
  let enrollment = null;
  if (req.dbUser) {
    [progress, enrollment] = await Promise.all([
      LessonProgress.findOne({ user: req.dbUser._id, lesson: lesson._id }).lean(),
      Enrollment.findOne({ user: req.dbUser._id, course: lesson.course }).lean(),
    ]);
    courseProgressPercent = enrollment?.progressPercent ?? null;
  }

  // A premium course's videos are only ever sent to the client once
  // purchased  mirrors how quiz answers are stripped server-side rather
  // than just hidden behind a UI lock.
  const locked = !!course?.isPremium && !enrollment?.isPaid;

  // Quizzes attach to a Module, not a Lesson  resolved here so the mobile
  // lesson screen can show a "Take Quiz" button without a separate request.
  // Only surfaced on the last lesson of the module, so the button appears
  // once per module rather than on every lesson in it.
  const moduleLessons = current ? flattened.filter((f) => f.module._id.equals(current.module._id)) : [];
  const isLastLessonInModule = current ? moduleLessons[moduleLessons.length - 1].lesson._id.equals(lesson._id) : false;
  const quiz = isLastLessonInModule ? await Quiz.findOne({ module: current!.module._id }).select("_id").lean() : null;

  // The module's quiz is compulsory: a learner can't be marked as having
  // passed it (and therefore unlocked the next module) without a passing
  // QuizAttempt on record.
  const quizPassed =
    quiz && req.dbUser ? !!(await QuizAttempt.exists({ user: req.dbUser._id, quiz: quiz._id, passed: true })) : false;

  res.json({
    lesson,
    video: locked ? null : normalizeLessonVideo(lesson),
    locked,
    progress,
    course: course ? { _id: course._id, title: course.title } : null,
    module: current ? { _id: current.module._id, title: current.module.title } : null,
    lessonNumberInModule,
    previousLessonId: index > 0 ? flattened[index - 1].lesson._id : null,
    nextLessonId: index >= 0 && index < flattened.length - 1 ? flattened[index + 1].lesson._id : null,
    courseProgressPercent,
    quizId: quiz?._id ?? null,
    quizPassed,
  });
}

async function recalculateCourseProgress(userId: string, courseId: string) {
  // Scoped to the lessons that are CURRENTLY published, not just any
  // LessonProgress row that happens to carry this course id  a lesson
  // deleted or unpublished after being completed used to stay counted in
  // the numerator while dropping out of the denominator, which is how
  // progress could read e.g. 113%.
  const publishedLessonIds = await Lesson.find({ course: courseId, isPublished: true }).distinct("_id");
  const totalLessons = publishedLessonIds.length;
  const completedLessons =
    totalLessons > 0
      ? await LessonProgress.countDocuments({ user: userId, lesson: { $in: publishedLessonIds }, isCompleted: true })
      : 0;

  const progressPercent = totalLessons > 0 ? Math.min(100, Math.round((completedLessons / totalLessons) * 100)) : 0;
  const isCourseComplete = totalLessons > 0 && completedLessons >= totalLessons;

  const previous = await Enrollment.findOne({ user: userId, course: courseId }).select("status").lean();
  const wasAlreadyComplete = previous?.status === "completed";

  const enrollment = await Enrollment.findOneAndUpdate(
    { user: userId, course: courseId },
    {
      progressPercent,
      lastActivityAt: new Date(),
      ...(isCourseComplete ? { status: "completed", completedAt: new Date() } : {}),
    },
    { new: true }
  );

  emitUserUpdate(userId, "course_progress");

  // Distinguishes "just crossed 100%" from "recalculated while already at
  // 100%" (e.g. rewatching a completed lesson)  course-completion rewards
  // and the certificate must only ever fire on the actual transition.
  return { progressPercent, isCourseComplete, isNewlyCompleted: isCourseComplete && !wasAlreadyComplete, enrollment };
}

// Shared by the manual "Mark Complete" button and by auto-completion once
// watch progress crosses ~90%  one place grants XP/credits/certificate/
// achievements so the two entry points can't drift out of sync.
async function grantLessonCompletion(
  dbUser: HydratedDocument<IUser>,
  lesson: HydratedDocument<ILesson>,
  progress: HydratedDocument<import("../models/LessonProgress").ILessonProgress>
) {
  let reward = null;
  const achievementsUnlocked: UnlockedAchievement[] = [];
  // Populated only when this call is the one that touched the streak (i.e.
  // it's this lesson's first-ever completion)  stays null on a replay of
  // an already-completed lesson, same as `reward`.
  let streak: { streakDays: number; increased: boolean } | null = null;

  if (!progress.xpAwarded) {
    progress.isCompleted = true;
    progress.completedAt = new Date();
    progress.xpAwarded = true;
    await progress.save();

    reward = await awardXpAndCredits(dbUser._id, lesson.xpReward || XP_RULES.lesson, lesson.creditReward, "lesson", "lesson", lesson._id);

    const today = todayStr(dbUser.timezone);
    const dailyGoal = await DailyGoal.findOneAndUpdate(
      { user: dbUser._id, date: today },
      { $inc: { completedLessons: 1 }, $setOnInsert: { targetLessons: dbUser.dailyGoalTarget ?? 4 } },
      { upsert: true, new: true }
    );

    // Only the day's FIRST completed lesson can have created this doc /
    // pushed its counter to exactly 1  everything after that on the same
    // day must not touch the streak again.
    if (dailyGoal.completedLessons === 1) {
      streak = await recordDailyActivity(dbUser._id);
    }

    achievementsUnlocked.push(...(await evaluateAchievements(dbUser._id, { type: "LESSON_COMPLETED" })));
  }

  const { progressPercent, isCourseComplete, isNewlyCompleted } = await recalculateCourseProgress(String(dbUser._id), String(lesson.course));

  if (isNewlyCompleted) {
    const courseCompletionReward = await awardXpAndCredits(dbUser._id, XP_RULES.courseCompletion, 0, "course_completion", "lesson", lesson.course);

    achievementsUnlocked.push(...(await evaluateAchievements(dbUser._id, { type: "COURSE_COMPLETED" })));

    const course = await Course.findById(lesson.course);
    let certificate = null;
    if (course?.hasCertificate) {
      certificate = await issueCertificate({
        userId: String(dbUser._id),
        courseId: String(course._id),
        studentName: dbUser.name,
        courseName: course.title,
        finalScore: 100,
      });
      await Notification.create({
        user: dbUser._id,
        type: "certificate_issued",
        title: "Certificate ready!",
        body: `Your certificate for ${course.title} is ready.`,
        data: { certificateId: certificate.certificateId },
      });
      achievementsUnlocked.push(...(await evaluateAchievements(dbUser._id, { type: "CERTIFICATE_EARNED" })));
    }

    return { reward, progressPercent, isCourseComplete, courseCompletionReward, certificate, achievementsUnlocked, streak };
  }

  return { reward, progressPercent, isCourseComplete, courseCompletionReward: null, certificate: null, achievementsUnlocked, streak };
}

// PUT /api/lessons/:id/complete  marks a lesson complete and grants XP
// exactly once per user+lesson (LessonProgress has a unique index on
// user+lesson, and xpAwarded gates the reward so replays are a no-op).
export async function completeLesson(req: AuthedRequest, res: Response) {
  if (!req.dbUser) return res.status(401).json({ error: "Unauthorized" });
  const lesson = await Lesson.findById(req.params.id);
  if (!lesson) return res.status(404).json({ error: "Lesson not found" });

  const progress = await LessonProgress.findOneAndUpdate(
    { user: req.dbUser._id, lesson: lesson._id },
    { $setOnInsert: { user: req.dbUser._id, lesson: lesson._id, course: lesson.course } },
    { upsert: true, new: true }
  );

  const result = await grantLessonCompletion(req.dbUser, lesson, progress);
  res.json({ progress, ...result });
}

// PUT /api/lessons/:id/progress  periodic video watch-progress save (the
// player calls this every ~10-15s, not every second). Crossing ~90% watched
// auto-completes the lesson through the same path as the manual button 
// but only once *today's* fresh watching accounts for a meaningful chunk of
// that 90%. Without this, resuming a lesson left at, say, 88% on a previous
// day would auto-complete (and grant XP/credits/streak) off a single ~12s
// tick moments after pressing play, which reads as "the streak counted
// immediately just from opening the video." The explicit "Mark Complete"
// button (completeLesson above) is unaffected  that stays instant always.
export async function updateLessonProgress(req: AuthedRequest, res: Response) {
  if (!req.dbUser) return res.status(401).json({ error: "Unauthorized" });
  const { watchedSeconds, durationSeconds } = req.body as { watchedSeconds?: unknown; durationSeconds?: unknown };
  if (typeof watchedSeconds !== "number" || typeof durationSeconds !== "number" || !(durationSeconds > 0) || watchedSeconds < 0) {
    return res.status(400).json({ error: "watchedSeconds and durationSeconds (both numbers, durationSeconds > 0) are required" });
  }

  const lesson = await Lesson.findById(req.params.id);
  if (!lesson) return res.status(404).json({ error: "Lesson not found" });

  // Watch-time saving is switched off (env.watchProgressEnabled): nothing is
  // written and the stored progress is echoed back unchanged, so the app's
  // cached lastPositionSeconds stays put and its YouTube WebView (whose HTML
  // embeds that value) doesn't reload mid-video. "Mark as complete" uses
  // /complete and is unaffected.
  if (!env.watchProgressEnabled) {
    const current = await LessonProgress.findOne({ user: req.dbUser._id, lesson: lesson._id });
    const progress = current ?? {
      user: req.dbUser._id,
      lesson: lesson._id,
      course: lesson.course,
      isCompleted: false,
      isBookmarked: false,
      xpAwarded: false,
      watchedSeconds: 0,
      lastPositionSeconds: 0,
      durationSeconds: 0,
    };
    return res.json({
      progress,
      percentage: 0,
      reward: null,
      progressPercent: null,
      isCourseComplete: false,
      courseCompletionReward: null,
      achievementsUnlocked: [],
      streak: null,
    });
  }

  const clampedPosition = Math.max(0, Math.min(watchedSeconds, durationSeconds));
  const today = todayStr(req.dbUser.timezone);

  const existing = await LessonProgress.findOne({ user: req.dbUser._id, lesson: lesson._id });
  const priorWatchedSeconds = existing?.watchedSeconds ?? 0;
  const newWatchedSeconds = Math.max(priorWatchedSeconds, clampedPosition);

  // Fix the checkpoint at the start of today's first update and leave it
  // alone for the rest of the day, so fresh-today watch time accumulates
  // correctly across every subsequent tick instead of resetting each time.
  const isNewCheckpointDay = existing?.watchDayCheckpointDate !== today;
  const checkpointSeconds = isNewCheckpointDay ? priorWatchedSeconds : (existing?.watchDayCheckpointSeconds ?? 0);

  const progress = await LessonProgress.findOneAndUpdate(
    { user: req.dbUser._id, lesson: lesson._id },
    {
      $set: {
        lastPositionSeconds: clampedPosition,
        durationSeconds,
        watchedSeconds: newWatchedSeconds,
        watchDayCheckpointDate: today,
        watchDayCheckpointSeconds: checkpointSeconds,
      },
      $setOnInsert: { user: req.dbUser._id, lesson: lesson._id, course: lesson.course },
    },
    { upsert: true, new: true }
  );

  const percentage = Math.min(100, Math.round((progress.watchedSeconds / durationSeconds) * 100));
  const watchedFreshToday = newWatchedSeconds - checkpointSeconds;
  const minFreshSecondsRequired = Math.min(60, durationSeconds * 0.3);

  if (percentage >= 90 && !progress.xpAwarded && watchedFreshToday >= minFreshSecondsRequired) {
    const result = await grantLessonCompletion(req.dbUser, lesson, progress);
    return res.json({ progress, percentage, ...result });
  }

  res.json({
    progress,
    percentage,
    reward: null,
    progressPercent: null,
    isCourseComplete: false,
    courseCompletionReward: null,
    achievementsUnlocked: [],
    streak: null,
  });
}

export async function toggleBookmark(req: AuthedRequest, res: Response) {
  if (!req.dbUser) return res.status(401).json({ error: "Unauthorized" });
  const lesson = await Lesson.findById(req.params.id).select("course").lean();
  if (!lesson) return res.status(404).json({ error: "Lesson not found" });

  const progress = await LessonProgress.findOneAndUpdate(
    { user: req.dbUser._id, lesson: lesson._id },
    [{ $set: { isBookmarked: { $not: "$isBookmarked" }, course: lesson.course } }],
    { upsert: true, new: true }
  );

  res.json({ progress });
}
