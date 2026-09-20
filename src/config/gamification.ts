// Server-side gamification rules. XP/Credit calculations must never be
// trusted from the client  everything here is the single source of truth.
// A later phase can move this into an admin-editable DB collection; the
// shape is deliberately simple so that migration is a drop-in.

export const LEVELS = [
  { level: 1, title: "Beginner", xpRequired: 0 },
  { level: 2, title: "Explorer", xpRequired: 500 },
  { level: 3, title: "Learner", xpRequired: 1200 },
  { level: 4, title: "Builder", xpRequired: 2200 },
  { level: 5, title: "Creator", xpRequired: 3500 },
  { level: 6, title: "Developer", xpRequired: 5200 },
  { level: 7, title: "Advanced", xpRequired: 7300 },
  { level: 8, title: "Specialist", xpRequired: 9800 },
  { level: 9, title: "Expert", xpRequired: 12800 },
  { level: 10, title: "Master", xpRequired: 16500 },
] as const;

export function levelForXp(xp: number): (typeof LEVELS)[number] {
  let current: (typeof LEVELS)[number] = LEVELS[0];
  for (const l of LEVELS) {
    if (xp >= l.xpRequired) current = l;
  }
  return current;
}

export function nextLevel(xp: number) {
  const current = levelForXp(xp);
  return LEVELS.find((l) => l.level === current.level + 1) ?? null;
}

export const XP_RULES = {
  lesson: 20,
  quiz: 50,
  exercise: 75,
  project: 300,
  projectBonusThreshold: 90,
  projectBonus: 100,
  courseCompletion: 1000,
};

export const LEADERBOARD_WEEKLY_POOL_CREDITS = 15000;
export const LEADERBOARD_REWARD_DISTRIBUTION = [5000, 3500, 2500, 2000, 2000];

// Spent to heal a broken streak (see progressController.restoreStreak) 
// only usable once the streak has actually finalized as MISSED
// (services/streak.getStreakState). Missing this window and then completing
// a lesson just resets the streak to 1 for free, same as it always has.
export const STREAK_RESTORE_COST = 20;

// Achievement rewards are no longer hardcoded here  each Achievement
// document carries its own `reward: { xp, credits }` (see models/Achievement
// and services/achievements.ts), editable from the admin panel without a
// code deploy.
