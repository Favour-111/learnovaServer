import { Schema, model, Types } from "mongoose";

export type QuestionType = "multiple_choice" | "true_false" | "code" | "scenario";

export interface IQuestion {
  quiz: Types.ObjectId;
  type: QuestionType;
  prompt: string;
  options: string[];
  correctOptionIndex?: number;
  correctBoolean?: boolean;
  explanation: string;
  order: number;
}

const questionSchema = new Schema<IQuestion>(
  {
    quiz: { type: Schema.Types.ObjectId, ref: "Quiz", required: true, index: true },
    type: { type: String, enum: ["multiple_choice", "true_false", "code", "scenario"], required: true },
    prompt: { type: String, required: true },
    options: { type: [String], default: [] },
    correctOptionIndex: Number,
    correctBoolean: Boolean,
    explanation: { type: String, default: "" },
    order: { type: Number, default: 0 },
  },
  { timestamps: true }
);

export const Question = model<IQuestion>("Question", questionSchema);
