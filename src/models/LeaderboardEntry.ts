import { Schema, model, Types } from "mongoose";

export interface ILeaderboardEntry {
  leaderboard: Types.ObjectId;
  user: Types.ObjectId;
  weeklyXp: number;
  rank: number;
  creditsAwarded: number;
}

const leaderboardEntrySchema = new Schema<ILeaderboardEntry>(
  {
    leaderboard: { type: Schema.Types.ObjectId, ref: "Leaderboard", required: true, index: true },
    user: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    weeklyXp: { type: Number, default: 0 },
    rank: { type: Number, default: 0 },
    creditsAwarded: { type: Number, default: 0 },
  },
  { timestamps: true }
);

leaderboardEntrySchema.index({ leaderboard: 1, user: 1 }, { unique: true });
leaderboardEntrySchema.index({ leaderboard: 1, weeklyXp: -1 });

export const LeaderboardEntry = model<ILeaderboardEntry>("LeaderboardEntry", leaderboardEntrySchema);
