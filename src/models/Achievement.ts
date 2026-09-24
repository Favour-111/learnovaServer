import { Schema, model } from "mongoose";

// Every metric the generic evaluator (services/achievements.ts) knows how to
// compute from real user data. Adding a NEW achievement that reuses one of
// these needs zero code changes  just an admin-panel row. Only a genuinely
// new *kind* of measurement needs a new metric added to that file's
// METRICS map (and, ideally, here too so the admin dropdown stays in sync).
export type AchievementMetric =
  | "user_level"
  | "learning_streak"
  | "lessons_completed"
  | "lessons_completed_today"
  | "courses_completed"
  | "quizzes_completed"
  | "quiz_score"
  | "quiz_categories_completed"
  | "projects_completed"
  | "project_score"
  | "certificates_earned"
  | "leaderboard_top5_finishes";

export type AchievementOperator = ">=" | ">" | "==" | "<=" | "<";

export type AchievementCategory =
  | "consistency"
  | "learning"
  | "courses"
  | "quizzes"
  | "projects"
  | "certificates"
  | "special";

export interface IAchievement {
  key: string;
  name: string;
  description: string;
  category: AchievementCategory;
  type: string;
  icon: string;
  requirement: {
    metric: AchievementMetric;
    operator: AchievementOperator;
    value: number;
  };
  reward: {
    xp: number;
    credits: number;
  };
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const achievementSchema = new Schema<IAchievement>(
  {
    key: { type: String, required: true, unique: true },
    name: { type: String, required: true },
    description: { type: String, required: true },
    category: {
      type: String,
      enum: ["consistency", "learning", "courses", "quizzes", "projects", "certificates", "special"],
      default: "special",
    },
    type: { type: String, default: "custom" },
    icon: { type: String, required: true },
    requirement: {
      metric: {
        type: String,
        enum: [
          "user_level",
          "learning_streak",
          "lessons_completed",
          "lessons_completed_today",
          "courses_completed",
          "quizzes_completed",
          "quiz_score",
          "quiz_categories_completed",
          "projects_completed",
          "project_score",
          "certificates_earned",
          "leaderboard_top5_finishes",
        ],
        required: true,
      },
      operator: { type: String, enum: [">=", ">", "==", "<=", "<"], default: ">=" },
      value: { type: Number, required: true },
    },
    reward: {
      xp: { type: Number, default: 0 },
      credits: { type: Number, default: 0 },
    },
    active: { type: Boolean, default: true },
  },
  { timestamps: true }
);

// Powers evaluateAchievements' pending-achievement lookup, which filters
// to active achievements before checking each one's progress.
achievementSchema.index({ active: 1 });

export const Achievement = model<IAchievement>("Achievement", achievementSchema);
