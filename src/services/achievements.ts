import { Types } from "mongoose";
import { Achievement, AchievementMetric, AchievementOperator, IAchievement } from "../models/Achievement";
import { UserAchievement } from "../models/UserAchievement";
import { RewardTransaction } from "../models/RewardTransaction";
import { User } from "../models/User";
import { LessonProgress } from "../models/LessonProgress";
import { Enrollment } from "../models/Enrollment";
import { QuizAttempt } from "../models/QuizAttempt";
import { ProjectAttempt } from "../models/ProjectAttempt";
import { Certificate } from "../models/Certificate";
import { LeaderboardEntry } from "../models/LeaderboardEntry";
import { DailyGoal } from "../models/DailyGoal";
import { Notification } from "../models/Notification";
import { awardXpAndCredits } from "./gamification";

export interface UnlockedAchievement {
  _id: Types.ObjectId;
  key: string;
  name: string;
  description: string;
  icon: string;
  category: string;
  reward: { xp: number; credits: number };
}

// The generic, DB-derived measurements every achievement's `requirement`
// can point at. This is the ONLY place that knows how to compute a metric —
// achievements themselves carry no logic, just {metric, operator, value},
// so a new achievement built from an existing metric (the overwhelming
// majority of cases) is a pure admin-panel row with no code change.
// Only a genuinely new kind of measurement needs a new entry here (and in
// AchievementMetric in models/Achievement.ts).
const METRICS: Record<AchievementMetric, (userId: Types.ObjectId) => Promise<number>> = {
  async user_level(userId) {
    const user = await User.findById(userId).select("level");
    return user?.level ?? 1;
  },
  async learning_streak(userId) {
    const user = await User.findById(userId).select("streakDays");
    return user?.streakDays ?? 0;
  },
  async lessons_completed(userId) {
    return LessonProgress.countDocuments({ user: userId, isCompleted: true });
  },
  async lessons_completed_today(userId) {
    const goal = await DailyGoal.findOne({ user: userId, date: todayStr() }).select("completedLessons");
    return goal?.completedLessons ?? 0;
  },
  async courses_completed(userId) {
    return Enrollment.countDocuments({ user: userId, status: "completed" });
  },
  async quizzes_completed(userId) {
    const quizIds = await QuizAttempt.distinct("quiz", { user: userId, passed: true });
    return quizIds.length;
  },
  async quiz_score(userId) {
    const best = await QuizAttempt.findOne({ user: userId }).sort({ scorePercent: -1 }).select("scorePercent");
    return best?.scorePercent ?? 0;
  },
  async projects_completed(userId) {
    return ProjectAttempt.countDocuments({ user: userId, passed: true });
  },
  async project_score(userId) {
    const best = await ProjectAttempt.findOne({ user: userId }).sort({ score: -1 }).select("score");
    return best?.score ?? 0;
  },
  async certificates_earned(userId) {
    return Certificate.countDocuments({ user: userId });
  },
  async leaderboard_top5_finishes(userId) {
    return LeaderboardEntry.countDocuments({ user: userId, rank: { $lte: 5 }, creditsAwarded: { $gt: 0 } });
  },
};

// Which metrics a given learning-action event can possibly affect — lets
// evaluateAchievements skip achievements it already knows can't have
// changed, instead of recomputing all 9 metrics on every single event.
// Adding a new event that reuses an existing metric is a one-line addition
// here; it never needs a new metric function.
const EVENT_METRICS: Record<string, AchievementMetric[]> = {
  LESSON_COMPLETED: ["lessons_completed", "lessons_completed_today", "learning_streak", "user_level"],
  VIDEO_COMPLETED: ["lessons_completed", "lessons_completed_today", "learning_streak", "user_level"],
  QUIZ_COMPLETED: ["quizzes_completed", "quiz_score", "user_level"],
  QUIZ_PASSED: ["quizzes_completed", "quiz_score", "user_level"],
  COURSE_COMPLETED: ["courses_completed", "user_level"],
  PROJECT_SUBMITTED: ["projects_completed", "project_score", "user_level"],
  PROJECT_COMPLETED: ["projects_completed", "project_score", "user_level"],
  CERTIFICATE_EARNED: ["certificates_earned"],
  DAILY_LEARNING_ACTIVITY: ["learning_streak", "lessons_completed_today"],
  LEADERBOARD_TOP5: ["leaderboard_top5_finishes"],
};

function compare(operator: AchievementOperator, value: number, target: number): boolean {
  switch (operator) {
    case ">=":
      return value >= target;
    case ">":
      return value > target;
    case "==":
      return value === target;
    case "<=":
      return value <= target;
    case "<":
      return value < target;
    default:
      return false;
  }
}

export function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

export function yesterdayStr(base: string): string {
  const d = new Date(`${base}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

// A streak is "at risk" once there's a real gap since the last active day —
// not today, not yesterday — and there's something to actually lose. This
// is purely derived from lastStreakDate vs today, so it never needs its own
// persisted flag: the moment the user completes another lesson without
// restoring, recordDailyActivity's own gap check resets streakDays to 1
// anyway, which naturally closes the restore window.
export function getStreakStatus(streakDays: number, lastStreakDate?: string): { streakDays: number; streakAtRisk: boolean } {
  if (!lastStreakDate || streakDays === 0) return { streakDays, streakAtRisk: false };
  const today = todayStr();
  if (lastStreakDate === today || lastStreakDate === yesterdayStr(today)) return { streakDays, streakAtRisk: false };
  return { streakDays, streakAtRisk: true };
}

// Real, backend-computed learning streak. Call exactly once per calendar
// day per user — the caller (grantLessonCompletion) gates this on "was this
// the day's first completed lesson" (DailyGoal.completedLessons === 1 right
// after the increment), and this function *also* independently no-ops if
// lastStreakDate is already today, so a duplicate call is always harmless.
// The client is never trusted with this value — it's derived purely from
// server-side activity records.
export async function recordDailyActivity(userId: Types.ObjectId): Promise<void> {
  const today = todayStr();
  const user = await User.findById(userId).select("streakDays lastStreakDate");
  if (!user) return;
  if (user.lastStreakDate === today) return;

  const continuesStreak = user.lastStreakDate === yesterdayStr(today);
  user.streakDays = continuesStreak ? user.streakDays + 1 : 1;
  user.lastStreakDate = today;
  await user.save();
}

// Upserts this user's progress against one achievement and, if the
// requirement is newly met, marks it completed and grants the reward
// exactly once. The RewardTransaction's unique (user, achievement) index is
// the hard guarantee against a duplicate payout — the rewardGranted flag on
// UserAchievement is just the fast-path check that avoids hitting it.
async function upsertProgressAndMaybeUnlock(
  userId: Types.ObjectId,
  achievement: IAchievement & { _id: Types.ObjectId },
  value: number
): Promise<UnlockedAchievement | null> {
  const existing = await UserAchievement.findOneAndUpdate(
    { user: userId, achievement: achievement._id },
    { $set: { progress: value, target: achievement.requirement.value } },
    { upsert: true, new: true }
  );

  const meets = compare(achievement.requirement.operator, value, achievement.requirement.value);
  if (!meets) return null;

  if (!existing.completed) {
    existing.completed = true;
    existing.completedAt = new Date();
    await existing.save();
  }

  if (existing.rewardGranted) return null;

  try {
    await RewardTransaction.create({
      user: userId,
      type: "ACHIEVEMENT_REWARD",
      achievement: achievement._id,
      xp: achievement.reward.xp,
      credits: achievement.reward.credits,
      description: `Achievement unlocked: ${achievement.name}`,
    });
  } catch {
    // Unique (user, achievement) index — another concurrent evaluation
    // already granted this reward. Make sure our flag catches up and stop.
    existing.rewardGranted = true;
    existing.rewardGrantedAt = existing.rewardGrantedAt ?? new Date();
    await existing.save();
    return null;
  }

  existing.rewardGranted = true;
  existing.rewardGrantedAt = new Date();
  await existing.save();

  if (achievement.reward.xp !== 0 || achievement.reward.credits !== 0) {
    await awardXpAndCredits(userId, achievement.reward.xp, achievement.reward.credits, "achievement", "achievement", achievement._id);
  }

  await Notification.create({
    user: userId,
    type: "achievement_unlocked",
    title: "Achievement unlocked!",
    body: `You earned "${achievement.name}" — +${achievement.reward.xp} XP, +${achievement.reward.credits} Credits.`,
    data: { achievementId: achievement._id, achievementKey: achievement.key },
  });

  return {
    _id: achievement._id,
    key: achievement.key,
    name: achievement.name,
    description: achievement.description,
    icon: achievement.icon,
    category: achievement.category,
    reward: achievement.reward,
  };
}

// Event-driven achievement evaluation. Call after any action that could
// have satisfied an achievement's requirement — pass the event so only the
// metrics that action could plausibly have moved get recomputed; omit it
// (see recalculateUserAchievements) to recheck everything.
export async function evaluateAchievements(userId: Types.ObjectId, event?: { type: string }): Promise<UnlockedAchievement[]> {
  const relevantMetrics = event ? EVENT_METRICS[event.type] : undefined;
  const query: Record<string, unknown> = { active: true };
  if (relevantMetrics) query["requirement.metric"] = { $in: relevantMetrics };

  const [candidates, rewardedIds] = await Promise.all([
    Achievement.find(query),
    UserAchievement.find({ user: userId, rewardGranted: true }).distinct("achievement"),
  ]);

  const rewardedSet = new Set(rewardedIds.map(String));
  const pending = candidates.filter((a) => !rewardedSet.has(String(a._id)));
  if (pending.length === 0) return [];

  const metricCache = new Map<string, Promise<number>>();
  function metricValue(metric: AchievementMetric): Promise<number> {
    let cached = metricCache.get(metric);
    if (!cached) {
      cached = METRICS[metric](userId);
      metricCache.set(metric, cached);
    }
    return cached;
  }

  const unlocked: UnlockedAchievement[] = [];
  for (const achievement of pending) {
    // eslint-disable-next-line no-await-in-loop
    const value = await metricValue(achievement.requirement.metric);
    // eslint-disable-next-line no-await-in-loop
    const result = await upsertProgressAndMaybeUnlock(userId, achievement, value);
    if (result) unlocked.push(result);
  }
  return unlocked;
}

// For existing users when an achievement is added/changed after the fact,
// or as a general repair tool — recomputes every active achievement's
// progress for this user from their real current state and unlocks/rewards
// anything now met. Safe to call as often as needed (fully idempotent).
export async function recalculateUserAchievements(userId: Types.ObjectId): Promise<UnlockedAchievement[]> {
  return evaluateAchievements(userId);
}
