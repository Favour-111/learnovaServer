import { Schema, model, Types } from "mongoose";

export type XPSource =
  | "lesson"
  | "quiz"
  | "exercise"
  | "project"
  | "project_bonus"
  | "course_completion"
  | "daily_challenge"
  | "streak"
  | "achievement";

export interface IXPTransaction {
  user: Types.ObjectId;
  amount: number;
  source: XPSource;
  sourceRefId?: Types.ObjectId;
  balanceAfter: number;
  createdAt: Date;
}

const xpTransactionSchema = new Schema<IXPTransaction>(
  {
    user: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    amount: { type: Number, required: true },
    source: {
      type: String,
      enum: [
        "lesson",
        "quiz",
        "exercise",
        "project",
        "project_bonus",
        "course_completion",
        "daily_challenge",
        "streak",
        "achievement",
      ],
      required: true,
    },
    sourceRefId: Schema.Types.ObjectId,
    balanceAfter: { type: Number, required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

// Powers the per-user "XP history" list (find by user, sorted newest first).
xpTransactionSchema.index({ user: 1, createdAt: -1 });
// Powers recomputeCurrentLeaderboard()'s weekly aggregation, which $matches
// createdAt across ALL users' transactions  without this it's a full
// collection scan on every leaderboard read, and that only gets worse as
// transaction history accumulates over time.
xpTransactionSchema.index({ createdAt: 1 });

export const XPTransaction = model<IXPTransaction>("XPTransaction", xpTransactionSchema);
