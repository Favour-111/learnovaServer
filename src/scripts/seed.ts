// One-off dev seed: baseline categories + achievements so the app and
// admin panel aren't empty on first run. Safe to re-run (upserts by key).
import mongoose from "mongoose";
import { connectDB } from "../config/db";
import { Category } from "../models/Category";
import { Achievement } from "../models/Achievement";

const CATEGORIES = [
  { name: "Development", slug: "development", icon: "code", colorToken: "blue" },
  { name: "Mobile", slug: "mobile", icon: "smartphone", colorToken: "purple" },
  { name: "AI", slug: "ai", icon: "sparkles", colorToken: "pink" },
  { name: "Data Science", slug: "data-science", icon: "bar-chart", colorToken: "green" },
  { name: "Cybersecurity", slug: "cybersecurity", icon: "shield", colorToken: "orange" },
  { name: "Design", slug: "design", icon: "palette", colorToken: "lavender" },
  { name: "Cloud", slug: "cloud", icon: "cloud", colorToken: "blue" },
  { name: "Business", slug: "business", icon: "briefcase", colorToken: "yellow" },
];

const ACHIEVEMENTS = [
  {
    key: "streak_7",
    name: "7 Day Streak",
    description: "Learned 7 days in a row.",
    category: "consistency",
    type: "streak",
    icon: "flame",
    requirement: { metric: "learning_streak", operator: ">=", value: 7 },
    reward: { xp: 100, credits: 20 },
    active: true,
  },
  {
    key: "first_course",
    name: "First Course",
    description: "Completed your first course.",
    category: "courses",
    type: "milestone",
    icon: "book",
    requirement: { metric: "courses_completed", operator: ">=", value: 1 },
    reward: { xp: 150, credits: 30 },
    active: true,
  },
  {
    key: "first_project",
    name: "First Project",
    description: "Submitted your first project.",
    category: "projects",
    type: "milestone",
    icon: "laptop",
    requirement: { metric: "projects_completed", operator: ">=", value: 1 },
    reward: { xp: 50, credits: 10 },
    active: true,
  },
  {
    key: "project_master",
    name: "Project Master",
    description: "Passed 10 projects.",
    category: "projects",
    type: "count",
    icon: "trophy",
    requirement: { metric: "projects_completed", operator: ">=", value: 10 },
    reward: { xp: 400, credits: 100 },
    active: true,
  },
  {
    key: "ten_lessons_day",
    name: "10 Lessons in One Day",
    description: "Completed 10 lessons in a single day.",
    category: "learning",
    type: "count",
    icon: "zap",
    requirement: { metric: "lessons_completed_today", operator: ">=", value: 10 },
    reward: { xp: 120, credits: 25 },
    active: true,
  },
  {
    key: "project_90",
    name: "90% Project Score",
    description: "Scored 90+ on a project.",
    category: "projects",
    type: "score",
    icon: "target",
    requirement: { metric: "project_score", operator: ">=", value: 90 },
    reward: { xp: 150, credits: 40 },
    active: true,
  },
  {
    key: "weekly_top5",
    name: "Weekly Top 5",
    description: "Finished top 5 on the weekly leaderboard.",
    category: "special",
    type: "leaderboard",
    icon: "crown",
    requirement: { metric: "leaderboard_top5_finishes", operator: ">=", value: 1 },
    reward: { xp: 200, credits: 50 },
    active: true,
  },
  {
    key: "first_certificate",
    name: "First Certificate",
    description: "Earned your first certificate.",
    category: "certificates",
    type: "milestone",
    icon: "graduation-cap",
    requirement: { metric: "certificates_earned", operator: ">=", value: 1 },
    reward: { xp: 200, credits: 50 },
    active: true,
  },
  {
    key: "quiz_perfectionist",
    name: "Quiz Perfectionist",
    description: "Score 100% on a quiz.",
    category: "quizzes",
    type: "score",
    icon: "zap",
    requirement: { metric: "quiz_score", operator: "==", value: 100 },
    reward: { xp: 100, credits: 20 },
    active: true,
  },
  {
    key: "quiz_grinder",
    name: "Quiz Grinder",
    description: "Passed 20 quizzes.",
    category: "quizzes",
    type: "count",
    icon: "target",
    requirement: { metric: "quizzes_completed", operator: ">=", value: 20 },
    reward: { xp: 250, credits: 60 },
    active: true,
  },
  {
    key: "ten_lessons_total",
    name: "10 Lessons Completed",
    description: "Completed 10 lessons in total.",
    category: "learning",
    type: "count",
    icon: "book",
    requirement: { metric: "lessons_completed", operator: ">=", value: 10 },
    reward: { xp: 80, credits: 15 },
    active: true,
  },
];

async function main() {
  await connectDB();

  for (const c of CATEGORIES) {
    // eslint-disable-next-line no-await-in-loop
    await Category.findOneAndUpdate({ slug: c.slug }, c, { upsert: true });
  }
  for (const a of ACHIEVEMENTS) {
    // eslint-disable-next-line no-await-in-loop
    await Achievement.findOneAndUpdate({ key: a.key }, a, { upsert: true });
  }

  // eslint-disable-next-line no-console
  console.log(`[seed] upserted ${CATEGORIES.length} categories and ${ACHIEVEMENTS.length} achievements`);
  await mongoose.disconnect();
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error("[seed] failed", err);
  process.exit(1);
});
