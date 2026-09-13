import { Schema, model, Types } from "mongoose";

export interface IDailyGoal {
  user: Types.ObjectId;
  date: string; // YYYY-MM-DD in user's local day
  targetLessons: number;
  completedLessons: number;
}

const dailyGoalSchema = new Schema<IDailyGoal>(
  {
    user: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    date: { type: String, required: true },
    targetLessons: { type: Number, default: 4 },
    completedLessons: { type: Number, default: 0 },
  },
  { timestamps: true }
);

dailyGoalSchema.index({ user: 1, date: 1 }, { unique: true });

export const DailyGoal = model<IDailyGoal>("DailyGoal", dailyGoalSchema);
