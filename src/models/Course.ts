import { Schema, model, Types } from "mongoose";

export type Difficulty = "beginner" | "intermediate" | "advanced";

export interface ICourse {
  title: string;
  slug: string;
  description: string;
  category: Types.ObjectId;
  difficulty: Difficulty;
  thumbnailUrl?: string;
  previewVideoId?: string;
  pdfUrl?: string;
  // Markdown-lite (headings via #/##/###, blank-line paragraphs, -/* lists,
  // **bold**) rendered natively by the app's own in-app document reader 
  // pdfUrl is kept only as a legacy fallback for courses that never got this.
  materialContent?: string;
  // Cost in the app's in-app credit currency to unlock a premium course.
  // Meaningless (ignored) when isPremium is false.
  priceCredits: number;
  language: string;
  tags: string[];
  skillsLearned: string[];
  requirements: string[];
  durationMinutes: number;
  xpReward: number;
  isPremium: boolean;
  isPublished: boolean;
  hasCertificate: boolean;
  rating: number;
  ratingCount: number;
  studentCount: number;
  moduleCount: number;
  lessonCount: number;
  projectCount: number;
  createdAt: Date;
  updatedAt: Date;
}

const courseSchema = new Schema<ICourse>(
  {
    title: { type: String, required: true },
    slug: { type: String, required: true, unique: true },
    description: { type: String, required: true },
    category: { type: Schema.Types.ObjectId, ref: "Category", required: true },
    difficulty: { type: String, enum: ["beginner", "intermediate", "advanced"], default: "beginner" },
    thumbnailUrl: String,
    // YouTube video id (not a full URL) for the course preview/trailer, kept
    // consistent with Lesson.videoId  frontend builds the watch/embed URL.
    previewVideoId: String,
    pdfUrl: String,
    materialContent: String,
    priceCredits: { type: Number, default: 0 },
    language: { type: String, default: "English" },
    tags: { type: [String], default: [] },
    skillsLearned: { type: [String], default: [] },
    requirements: { type: [String], default: [] },
    durationMinutes: { type: Number, default: 0 },
    xpReward: { type: Number, default: 1000 },
    isPremium: { type: Boolean, default: false },
    isPublished: { type: Boolean, default: false },
    hasCertificate: { type: Boolean, default: true },
    rating: { type: Number, default: 0 },
    ratingCount: { type: Number, default: 0 },
    studentCount: { type: Number, default: 0 },
    moduleCount: { type: Number, default: 0 },
    lessonCount: { type: Number, default: 0 },
    projectCount: { type: Number, default: 0 },
  },
  { timestamps: true }
);

// Powers listCourses' isPublished + optional category filter (the most
// common shape that endpoint is called with).
courseSchema.index({ isPublished: 1, category: 1 });

export const Course = model<ICourse>("Course", courseSchema);
