import { Schema, model } from "mongoose";

export interface ILeaderboard {
  weekStart: Date;
  weekEnd: Date;
  status: "active" | "frozen" | "settled";
  rewardsDistributedAt?: Date;
  // Last time recomputeCurrentLeaderboard() actually ran the weekly
  // aggregation + LeaderboardEntry bulkWrite — lets reads throttle that
  // (relatively expensive, and a write) work instead of repeating it on
  // every single GET /leaderboard/current.
  entriesRecomputedAt?: Date;
}

const leaderboardSchema = new Schema<ILeaderboard>(
  {
    weekStart: { type: Date, required: true },
    weekEnd: { type: Date, required: true },
    status: { type: String, enum: ["active", "frozen", "settled"], default: "active" },
    rewardsDistributedAt: Date,
    entriesRecomputedAt: Date,
  },
  { timestamps: true }
);

leaderboardSchema.index({ weekStart: 1 }, { unique: true });

export const Leaderboard = model<ILeaderboard>("Leaderboard", leaderboardSchema);
