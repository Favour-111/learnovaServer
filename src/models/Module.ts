import { Schema, model, Types } from "mongoose";

export interface IModule {
  course: Types.ObjectId;
  title: string;
  description?: string;
  order: number;
  isPublished: boolean;
}

const moduleSchema = new Schema<IModule>(
  {
    course: { type: Schema.Types.ObjectId, ref: "Course", required: true, index: true },
    title: { type: String, required: true },
    description: String,
    order: { type: Number, default: 0 },
    isPublished: { type: Boolean, default: false },
  },
  { timestamps: true }
);

export const Module = model<IModule>("Module", moduleSchema);
