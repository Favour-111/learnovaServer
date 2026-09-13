import { Schema, model, Types } from "mongoose";

export interface IEnrollment {
  user: Types.ObjectId;
  course: Types.ObjectId;
  status: "active" | "completed";
  // Only meaningful for premium courses — false until the learner spends
  // credits via POST /courses/:id/purchase. Free courses are never gated on
  // this (checks only apply when the course itself is isPremium).
  isPaid: boolean;
  progressPercent: number;
  enrolledAt: Date;
  completedAt?: Date;
  lastActivityAt?: Date;
}

const enrollmentSchema = new Schema<IEnrollment>(
  {
    user: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    course: { type: Schema.Types.ObjectId, ref: "Course", required: true, index: true },
    status: { type: String, enum: ["active", "completed"], default: "active" },
    isPaid: { type: Boolean, default: false },
    progressPercent: { type: Number, default: 0 },
    enrolledAt: { type: Date, default: Date.now },
    completedAt: Date,
    lastActivityAt: Date,
  },
  { timestamps: true }
);

enrollmentSchema.index({ user: 1, course: 1 }, { unique: true });

export const Enrollment = model<IEnrollment>("Enrollment", enrollmentSchema);
