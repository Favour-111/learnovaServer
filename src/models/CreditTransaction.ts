import { Schema, model, Types } from "mongoose";

export type CreditSource =
  | "lesson"
  | "quiz"
  | "project"
  | "challenge"
  | "achievement"
  | "leaderboard_reward"
  | "referral"
  | "spend_unlock"
  | "spend_streak_restore";

export interface ICreditTransaction {
  user: Types.ObjectId;
  amount: number; // negative for spends
  source: CreditSource;
  sourceRefId?: Types.ObjectId;
  balanceAfter: number;
  createdAt: Date;
}

const creditTransactionSchema = new Schema<ICreditTransaction>(
  {
    user: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    amount: { type: Number, required: true },
    source: {
      type: String,
      enum: ["lesson", "quiz", "project", "challenge", "achievement", "leaderboard_reward", "referral", "spend_unlock", "spend_streak_restore"],
      required: true,
    },
    sourceRefId: Schema.Types.ObjectId,
    balanceAfter: { type: Number, required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

// Powers the Wallet screen's transaction history (find by user, sorted
// newest first) — without it, this degrades to a collection scan of every
// credit transaction ever recorded for that user as history grows.
creditTransactionSchema.index({ user: 1, createdAt: -1 });

export const CreditTransaction = model<ICreditTransaction>("CreditTransaction", creditTransactionSchema);
