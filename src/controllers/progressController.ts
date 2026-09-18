import { Response, NextFunction } from "express";
import { Enrollment } from "../models/Enrollment";
import { ProjectAttempt } from "../models/ProjectAttempt";
import { QuizAttempt } from "../models/QuizAttempt";
import { Certificate } from "../models/Certificate";
import { DailyGoal } from "../models/DailyGoal";
import { CreditTransaction } from "../models/CreditTransaction";
import { AuthedRequest } from "../middleware/auth";
import { levelForXp, nextLevel, STREAK_RESTORE_COST } from "../config/gamification";
import { getStreakStatus, yesterdayStr, todayStr } from "../services/achievements";

// GET /api/progress — aggregate stats for the Progress screen.
export async function getProgress(req: AuthedRequest, res: Response) {
  if (!req.dbUser) return res.status(401).json({ error: "Unauthorized" });
  const userId = req.dbUser._id;

  const [enrollments, projectAttempts, quizAttempts, certificateCount, recentAttempts] = await Promise.all([
    Enrollment.find({ user: userId }),
    ProjectAttempt.find({ user: userId }),
    QuizAttempt.find({ user: userId }),
    Certificate.countDocuments({ user: userId }),
    ProjectAttempt.find({ user: userId }).sort({ createdAt: -1 }).limit(4).populate("project", "title"),
  ]);

  const passedProjects = projectAttempts.filter((a) => a.passed);
  const avgProjectScore = passedProjects.length
    ? Math.round(passedProjects.reduce((sum, a) => sum + a.score, 0) / passedProjects.length)
    : 0;
  const avgQuizScore = quizAttempts.length
    ? Math.round(quizAttempts.reduce((sum, a) => sum + a.scorePercent, 0) / quizAttempts.length)
    : 0;

  const currentLevel = levelForXp(req.dbUser.xp);
  const upcomingLevel = nextLevel(req.dbUser.xp);
  const { streakAtRisk } = getStreakStatus(req.dbUser.streakDays, req.dbUser.lastStreakDate);

  res.json({
    totalXp: req.dbUser.xp,
    currentLevel,
    xpToNextLevel: upcomingLevel ? upcomingLevel.xpRequired - req.dbUser.xp : 0,
    totalCourses: enrollments.length,
    completedCourses: enrollments.filter((e) => e.status === "completed").length,
    activeCourses: enrollments.filter((e) => e.status === "active").length,
    projectsCompleted: passedProjects.length,
    averageProjectScore: avgProjectScore,
    quizAverage: avgQuizScore,
    quizzesCompleted: quizAttempts.length,
    learningStreak: req.dbUser.streakDays,
    streakAtRisk,
    certificates: certificateCount,
    recentProjects: recentAttempts.map((a) => ({
      title: (a.project as unknown as { title?: string })?.title ?? "Project",
      score: a.score,
    })),
  });
}

// POST /api/progress/restore-streak — spends STREAK_RESTORE_COST credits to
// heal a broken streak instead of letting it reset to 0/1. Only works while
// getStreakStatus says the streak is actually at risk — recomputed here
// server-side rather than trusted from whatever the client last saw.
export async function restoreStreak(req: AuthedRequest, res: Response, next: NextFunction) {
  if (!req.dbUser) return res.status(401).json({ error: "Unauthorized" });

  try {
    const { streakAtRisk } = getStreakStatus(req.dbUser.streakDays, req.dbUser.lastStreakDate);
    if (!streakAtRisk) {
      return res.status(400).json({ error: "Your streak isn't at risk right now." });
    }
    if (req.dbUser.credits < STREAK_RESTORE_COST) {
      return res.status(402).json({ error: "Not enough credits", required: STREAK_RESTORE_COST, balance: req.dbUser.credits });
    }

    req.dbUser.credits -= STREAK_RESTORE_COST;
    // Heals the gap by pretending the last active day was yesterday — the
    // next lesson completion then goes through recordDailyActivity's normal
    // "continues streak" path and increments like nothing happened, instead
    // of resetting to 1.
    req.dbUser.lastStreakDate = yesterdayStr(todayStr());
    await req.dbUser.save();

    await CreditTransaction.create({
      user: req.dbUser._id,
      amount: -STREAK_RESTORE_COST,
      source: "spend_streak_restore",
      balanceAfter: req.dbUser.credits,
    });

    res.json({ streakDays: req.dbUser.streakDays, credits: req.dbUser.credits });
  } catch (err) {
    next(err);
  }
}

// GET /api/progress/daily-goal — today's lesson goal for the Home screen.
// Created on first read for the day (same date key lessonController uses
// when it increments completedLessons on lesson completion).
export async function getDailyGoal(req: AuthedRequest, res: Response) {
  if (!req.dbUser) return res.status(401).json({ error: "Unauthorized" });
  const today = new Date().toISOString().slice(0, 10);

  // targetLessons is always synced to the user's current preference (not
  // just set once on insert) so changing it in Settings takes effect for
  // today's already-created goal too, not just tomorrow's.
  const goal = await DailyGoal.findOneAndUpdate(
    { user: req.dbUser._id, date: today },
    { $set: { targetLessons: req.dbUser.dailyGoalTarget ?? 4 }, $setOnInsert: { completedLessons: 0 } },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  res.json({
    date: goal.date,
    targetLessons: goal.targetLessons,
    completedLessons: goal.completedLessons,
  });
}
