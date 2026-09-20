import { Schema, model, Types } from "mongoose";

export interface IUserAchievement {
  user: Types.ObjectId;
  achievement: Types.ObjectId;
  progress: number;
  target: number;
  completed: boolean;
  completedAt: Date | null;
  rewardGranted: boolean;
  rewardGrantedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const userAchievementSchema = new Schema<IUserAchievement>(
  {
    user: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    achievement: { type: Schema.Types.ObjectId, ref: "Achievement", required: true },
    progress: { type: Number, default: 0 },
    target: { type: Number, default: 0 },
    completed: { type: Boolean, default: false },
    completedAt: { type: Date, default: null },
    rewardGranted: { type: Boolean, default: false },
    rewardGrantedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

// One progress record per user+achievement  the evaluator upserts against
// this, never creates a second row for the same pair.
userAchievementSchema.index({ user: 1, achievement: 1 }, { unique: true });

export const UserAchievement = model<IUserAchievement>("UserAchievement", userAchievementSchema);
