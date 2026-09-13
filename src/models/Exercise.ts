import { Schema, model, Types } from "mongoose";

export interface IExercise {
  lesson: Types.ObjectId;
  title: string;
  instructions: string;
  starterCode?: string;
  xpReward: number;
}

const exerciseSchema = new Schema<IExercise>(
  {
    lesson: { type: Schema.Types.ObjectId, ref: "Lesson", required: true, index: true },
    title: { type: String, required: true },
    instructions: { type: String, required: true },
    starterCode: String,
    xpReward: { type: Number, default: 75 },
  },
  { timestamps: true }
);

export const Exercise = model<IExercise>("Exercise", exerciseSchema);
