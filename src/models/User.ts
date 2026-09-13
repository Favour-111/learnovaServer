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
  // YYYY-MM-DD (UTC) of the last day real learning activity was recorded —
  // the anchor recordDailyActivity() (services/achievements.ts) uses to
  // decide whether today continues the streak, resets it, or (repeat
  // activity same day) leaves it untouched.
  lastStreakDate?: string;
  lastActiveAt?: Date;
  pushTokens: string[];
  reducedMotion: boolean;
  savedCourses: Types.ObjectId[];
  // Optional because existing users predate this field — every reader
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
    pushTokens: { type: [String], default: [] },
    reducedMotion: { type: Boolean, default: false },
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
