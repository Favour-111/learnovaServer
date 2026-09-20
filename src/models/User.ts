import { Schema, model, Types } from "mongoose";

export interface INotificationPreferences {
  learningReminders: boolean;
  courseUpdates: boolean;
  achievementAlerts: boolean;
  streakReminders: boolean;
  courseRecommendations: boolean;
  communityActivity: boolean;
}

export interface IUser {
  clerkId: string;
  email: string;
  name: string;
  avatarUrl?: string;
  role: "user" | "admin";
  interests: string[];
  level: number;
  xp: number;
  credits: number;
  streakDays: number;
  // YYYY-MM-DD (UTC) of the last day real learning activity was recorded 
  // the anchor recordDailyActivity() (services/achievements.ts) uses to
  // decide whether today continues the streak, resets it, or (repeat
  // activity same day) leaves it untouched.
  lastStreakDate?: string;
  lastActiveAt?: Date;
  // IANA zone name (e.g. "America/New_York") anchoring the streak system's
  // 1:00 AM daily boundary (services/streak.ts)  captured once from the
  // device on first launch/login and deliberately never auto-resynced
  // afterward (learnovaApp/app/_layout.tsx), so changing the phone's
  // timezone can't shift a learner's streak boundary. Undefined for a user
  // who hasn't had one captured yet; every reader falls back to UTC.
  timezone?: string;
  pushTokens: string[];
  reducedMotion: boolean;
  // How many lessons/day the Home screen's daily-goal card and
  // GET /progress/daily-goal target  see getDailyGoal, which syncs each
  // day's DailyGoal document to whatever this is set to.
  dailyGoalTarget: number;
  savedCourses: Types.ObjectId[];
  // Optional because existing users predate this field  every reader
  // (notify.ts, the client) must treat a missing object as "everything on"
  // rather than silently going quiet for people who never touched Settings.
  notificationPreferences?: INotificationPreferences;
  createdAt: Date;
  updatedAt: Date;
}

const userSchema = new Schema<IUser>(
  {
    clerkId: { type: String, required: true, unique: true, index: true },
    email: { type: String, required: true, unique: true },
    name: { type: String, required: true },
    avatarUrl: String,
    role: { type: String, enum: ["user", "admin"], default: "user" },
    interests: { type: [String], default: [] },
    level: { type: Number, default: 1 },
    xp: { type: Number, default: 0 },
    credits: { type: Number, default: 0 },
    streakDays: { type: Number, default: 0 },
    lastStreakDate: String,
    lastActiveAt: Date,
    timezone: String,
    pushTokens: { type: [String], default: [] },
    reducedMotion: { type: Boolean, default: false },
    dailyGoalTarget: { type: Number, default: 4, min: 1, max: 10 },
    savedCourses: { type: [Schema.Types.ObjectId], ref: "Course", default: [] },
    notificationPreferences: {
      type: {
        learningReminders: { type: Boolean, default: true },
        courseUpdates: { type: Boolean, default: true },
        achievementAlerts: { type: Boolean, default: true },
        streakReminders: { type: Boolean, default: true },
        courseRecommendations: { type: Boolean, default: true },
        communityActivity: { type: Boolean, default: true },
      },
      required: false,
    },
  },
  { timestamps: true }
);

export type UserId = Types.ObjectId;
export const User = model<IUser>("User", userSchema);
