import { Response } from "express";
import { Achievement } from "../models/Achievement";
import { UserAchievement } from "../models/UserAchievement";
import { AuthedRequest } from "../middleware/auth";
import { recalculateUserAchievements } from "../services/achievements";

// Shared by GET /achievements, /achievements/me, /achievements/me/completed 
// every active achievement definition merged with this user's live progress.
// Nothing here is hardcoded: name/description/icon/category/requirement/
// reward all come straight from the Achievement document, which the admin
// panel edits directly.
async function buildAchievementList(userId?: string) {
  const achievements = await Achievement.find({ active: true }).sort({ createdAt: 1 }).lean();

  let progressMap = new Map<string, Record<string, unknown>>();
  if (userId) {
    const progress = await UserAchievement.find({ user: userId }).lean();
    progressMap = new Map(progress.map((p) => [String(p.achievement), p]));
  }

  return achievements.map((a) => {
    const p = progressMap.get(String(a._id));
    return {
      _id: a._id,
      key: a.key,
      name: a.name,
      description: a.description,
      category: a.category,
      type: a.type,
      icon: a.icon,
      progress: p?.progress ?? 0,
      target: a.requirement.value,
      completed: p?.completed ?? false,
      completedAt: p?.completedAt ?? null,
      // Kept alongside `completed` for the mobile client's existing
      // locked/unlocked naming.
      unlocked: p?.completed ?? false,
      unlockedAt: p?.completedAt ?? null,
      reward: a.reward,
    };
  });
}

// GET /api/achievements  public-ish listing (progress merged in only when
// signed in); mirrors /me so either can be used as the main fetch.
export async function listAchievements(req: AuthedRequest, res: Response) {
  const achievements = await buildAchievementList(req.dbUser ? String(req.dbUser._id) : undefined);
  res.json({ achievements });
}

// GET /api/achievements/me
export async function listMyAchievements(req: AuthedRequest, res: Response) {
  if (!req.dbUser) return res.status(401).json({ error: "Unauthorized" });
  const achievements = await buildAchievementList(String(req.dbUser._id));
  res.json({ achievements });
}

// GET /api/achievements/me/completed
export async function listMyCompletedAchievements(req: AuthedRequest, res: Response) {
  if (!req.dbUser) return res.status(401).json({ error: "Unauthorized" });
  const achievements = (await buildAchievementList(String(req.dbUser._id))).filter((a) => a.completed);
  res.json({ achievements });
}

// GET /api/achievements/:id  single achievement definition + this user's progress.
export async function getAchievement(req: AuthedRequest, res: Response) {
  const achievement = await Achievement.findById(req.params.id).lean();
  if (!achievement || !achievement.active) return res.status(404).json({ error: "Achievement not found" });

  const progress = req.dbUser ? await UserAchievement.findOne({ user: req.dbUser._id, achievement: achievement._id }).lean() : null;

  res.json({
    achievement: {
      _id: achievement._id,
      key: achievement.key,
      name: achievement.name,
      description: achievement.description,
      category: achievement.category,
      type: achievement.type,
      icon: achievement.icon,
      progress: progress?.progress ?? 0,
      target: achievement.requirement.value,
      completed: progress?.completed ?? false,
      completedAt: progress?.completedAt ?? null,
      unlocked: progress?.completed ?? false,
      unlockedAt: progress?.completedAt ?? null,
      reward: achievement.reward,
    },
  });
}

// POST /api/achievements/me/recalculate  re-evaluates every active
// achievement against this user's real current state. Exposed to the
// signed-in user themselves (not just admin) since it's a safe, idempotent
// read-and-catch-up operation  useful right after an achievement's
// requirement changes, or if a client suspects it missed an unlock.
export async function recalculateMyAchievements(req: AuthedRequest, res: Response) {
  if (!req.dbUser) return res.status(401).json({ error: "Unauthorized" });
  const unlocked = await recalculateUserAchievements(req.dbUser._id);
  res.json({ unlocked });
}
