import { Schema, model, Types } from "mongoose";

export interface IQuiz {
  module: Types.ObjectId;
  course: Types.ObjectId;
  title: string;
  xpReward: number;
  creditReward: number;
  passingScorePercent: number;
}

const quizSchema = new Schema<IQuiz>(
  {
    module: { type: Schema.Types.ObjectId, ref: "Module", required: true, index: true },
    course: { type: Schema.Types.ObjectId, ref: "Course", required: true, index: true },
    title: { type: String, required: true },
    xpReward: { type: Number, default: 50 },
    creditReward: { type: Number, default: 20 },
    passingScorePercent: { type: Number, default: 70 },
  },
  { timestamps: true }
);

export const Quiz = model<IQuiz>("Quiz", quizSchema);
