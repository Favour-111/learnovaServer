import { Schema, model, Types } from "mongoose";

export interface IQuizAttempt {
  user: Types.ObjectId;
  quiz: Types.ObjectId;
  answers: { question: Types.ObjectId; selectedOptionIndex?: number; selectedBoolean?: boolean }[];
  scorePercent: number;
  passed: boolean;
  xpAwarded: number;
  creditsAwarded: number;
  attemptNumber: number;
  createdAt: Date;
}

const quizAttemptSchema = new Schema<IQuizAttempt>(
  {
    user: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    quiz: { type: Schema.Types.ObjectId, ref: "Quiz", required: true, index: true },
    answers: [
      {
        question: { type: Schema.Types.ObjectId, ref: "Question", required: true },
        selectedOptionIndex: Number,
        selectedBoolean: Boolean,
      },
    ],
    scorePercent: { type: Number, required: true },
    passed: { type: Boolean, required: true },
    xpAwarded: { type: Number, default: 0 },
    creditsAwarded: { type: Number, default: 0 },
    attemptNumber: { type: Number, default: 1 },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

export const QuizAttempt = model<IQuizAttempt>("QuizAttempt", quizAttemptSchema);
