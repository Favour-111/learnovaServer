import { Schema, model, Types } from "mongoose";

export interface IQuiz {
  // Both optional  a quiz can belong to a course module (unlocked as part
  // of that module, the original use case) or stand entirely alone
  // (discoverable from the Quiz Library/Explore, not tied to any course).
  module?: Types.ObjectId;
  course?: Types.ObjectId;
  category?: Types.ObjectId;
  title: string;
  description: string;
  // Falls back to the category's own imageUrl on the client when unset 
  // same "optional artwork, icon fallback" pattern as Category.imageUrl.
  imageUrl?: string;
  topics: string[];
  estimatedMinutes: number;
  xpReward: number;
  creditReward: number;
  passingScorePercent: number;
  isPublished: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const quizSchema = new Schema<IQuiz>(
  {
    module: { type: Schema.Types.ObjectId, ref: "Module", index: true },
    course: { type: Schema.Types.ObjectId, ref: "Course", index: true },
    category: { type: Schema.Types.ObjectId, ref: "Category", index: true },
    title: { type: String, required: true },
    description: { type: String, default: "" },
    imageUrl: String,
    topics: { type: [String], default: [] },
    estimatedMinutes: { type: Number, default: 5 },
    xpReward: { type: Number, default: 50 },
    creditReward: { type: Number, default: 20 },
    passingScorePercent: { type: Number, default: 70 },
    // Defaults to true (unlike Course/Module/Lesson, which default to
    // false) because isPublished is new on an existing, already-in-use
    // model  every quiz created before this field existed reads it as
    // unset, and Mongoose applies the schema default on read. Defaulting
    // to false would silently 404 every module quiz already gating real
    // lesson progress today; defaulting to true preserves that behavior
    // and just gives admins an explicit way to unpublish/stage a quiz.
    isPublished: { type: Boolean, default: true },
  },
  { timestamps: true }
);

export const Quiz = model<IQuiz>("Quiz", quizSchema);
