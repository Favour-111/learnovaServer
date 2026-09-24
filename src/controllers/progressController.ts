import { Response, NextFunction } from "express";
import { Enrollment } from "../models/Enrollment";
import { ProjectAttempt } from "../models/ProjectAttempt";
import { QuizAttempt } from "../models/QuizAttempt";
import { Certificate } from "../models/Certificate";
import { DailyGoal } from "../models/DailyGoal";
import { CreditTransaction } from "../models/CreditTransaction";
import { AuthedRequest } from "../middleware/auth";
import { levelForXp, nextLevel, STREAK_RESTORE_COST } from "../config/gamification";
import { getStreakState, todayStr } from "../services/streak";
import { addDaysToDateStr } from "../services/streakTime";

// GET /api/progress  aggregate stats for the Progress screen.
//
// Only counts/averages are ever returned here, never the underlying rows
// this used to fetch every Enrollment/ProjectAttempt/QuizAttempt document
// for the user just to .filter()/.reduce() over them in Node. Computing
// those in MongoDB via countDocuments/aggregate instead means a user with
// years of history costs the same as one with a handful of rows.
export async function getProgress(req: AuthedRequest, res: Response) {
  if (!req.dbUser) return res.status(401).json({ error: "Unauthorized" });
  const userId = req.dbUser._id;

  const [enrollmentCounts, projectStats, quizStats, certificateCount, recentAttempts] = await Promise.all([
    Enrollment.aggregate([{ $match: { user: userId } }, { $group: { _id: "$status", count: { $sum: 1 } } }]),
    ProjectAttempt.aggregate([
      { $match: { user: userId, passed: true } },
      { $group: { _id: null, count: { $sum: 1 }, avgScore: { $avg: "$score" } } },
    ]),
    QuizAttempt.aggregate([{ $match: { user: userId } }, { $group: { _id: null, count: { $sum: 1 }, avgScore: { $avg: "$scorePercent" } } }]),
    Certificate.countDocuments({ user: userId }),
    ProjectAttempt.find({ user: userId }).sort({ createdAt: -1 }).limit(4).select("project score").populate("project", "title").lean(),
  ]);

  const totalCourses = enrollmentCounts.reduce((sum, row) => sum + row.count, 0);
  const completedCourses = enrollmentCounts.find((row) => row._id === "completed")?.count ?? 0;
  const activeCourses = enrollmentCounts.find((row) => row._id === "active")?.count ?? 0;
  const projectsCompleted = projectStats[0]?.count ?? 0;
  const avgProjectScore = projectStats[0] ? Math.round(projectStats[0].avgScore) : 0;
  const quizzesCompleted = quizStats[0]?.count ?? 0;
  const avgQuizScore = quizStats[0] ? Math.round(quizStats[0].avgScore) : 0;

  const currentLevel = levelForXp(req.dbUser.xp);
  const upcomingLevel = nextLevel(req.dbUser.xp);
  const streak = getStreakState(req.dbUser.streakDays, req.dbUser.lastStreakDate, req.dbUser.timezone);

  res.json({
    totalXp: req.dbUser.xp,
    currentLevel,
    xpToNextLevel: upcomingLevel ? upcomingLevel.xpRequired - req.dbUser.xp : 0,
    totalCourses,
    completedCourses,
    activeCourses,
    projectsCompleted,
    averageProjectScore: avgProjectScore,
    quizAverage: avgQuizScore,
    quizzesCompleted,
    learningStreak: streak.streakDays,
    streakAtRisk: streak.streakAtRisk,
    streakState: streak.state,
    streakPreviousDays: streak.previousStreakDays,
    streakNextBoundaryAt: streak.nextBoundaryAt,
    certificates: certificateCount,
    recentProjects: recentAttempts.map((a) => ({
      title: (a.project as unknown as { title?: string })?.title ?? "Project",
      score: a.score,
    })),
  });
}

// POST /api/progress/restore-streak  spends STREAK_RESTORE_COST credits to
// heal a broken streak instead of letting it reset to 0/1. Only works once
// getStreakState says the streak has actually finalized as MISSED 
// recomputed here server-side rather than trusted from whatever the client
// last saw.
export async function restoreStreak(req: AuthedRequest, res: Response, next: NextFunction) {
  if (!req.dbUser) return res.status(401).json({ error: "Unauthorized" });

  try {
    const streak = getStreakState(req.dbUser.streakDays, req.dbUser.lastStreakDate, req.dbUser.timezone);
    if (streak.state !== "MISSED") {
      return res.status(400).json({ error: "Your streak isn't at risk right now." });
    }
    if (req.dbUser.credits < STREAK_RESTORE_COST) {
      return res.status(402).json({ error: "Not enough credits", required: STREAK_RESTORE_COST, balance: req.dbUser.credits });
    }

    req.dbUser.credits -= STREAK_RESTORE_COST;
    // Heals the gap by pretending the last active day was yesterday  the
    // next lesson completion then goes through recordDailyActivity's normal
    // "continues streak" path and increments like nothing happened, instead
    // of resetting to 1.
    req.dbUser.lastStreakDate = addDaysToDateStr(todayStr(req.dbUser.timezone), -1);
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

// GET /api/progress/daily-goal  today's lesson goal for the Home screen.
// Created on first read for the day (same date key lessonController uses
// when it increments completedLessons on lesson completion).
export async function getDailyGoal(req: AuthedRequest, res: Response) {
  if (!req.dbUser) return res.status(401).json({ error: "Unauthorized" });
  const today = todayStr(req.dbUser.timezone);

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
