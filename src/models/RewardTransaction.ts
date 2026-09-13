import { Schema, model, Types } from "mongoose";

// Audit trail for achievement rewards, and — via the unique index below —
// a hard, DB-level guarantee that the same achievement never pays out
// twice for the same user, independent of the UserAchievement.rewardGranted
// flag (defense in depth, same pattern as Certificate's unique user+course
// index).
export interface IRewardTransaction {
  user: Types.ObjectId;
  type: "ACHIEVEMENT_REWARD";
  achievement: Types.ObjectId;
  xp: number;
  credits: number;
  description: string;
  createdAt: Date;
}

const rewardTransactionSchema = new Schema<IRewardTransaction>(
  {
    user: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    type: { type: String, enum: ["ACHIEVEMENT_REWARD"], required: true },
    achievement: { type: Schema.Types.ObjectId, ref: "Achievement", required: true },
    xp: { type: Number, default: 0 },
    credits: { type: Number, default: 0 },
    description: { type: String, required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

rewardTransactionSchema.index({ user: 1, achievement: 1 }, { unique: true });

export const RewardTransaction = model<IRewardTransaction>("RewardTransaction", rewardTransactionSchema);
