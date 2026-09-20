import { Schema, model, Types } from "mongoose";

export interface ICertificate {
  certificateId: string; // e.g. WD-2026-8F72A1
  user: Types.ObjectId;
  course: Types.ObjectId;
  studentName: string;
  courseName: string;
  finalScore: number;
  completedAt: Date;
  qrCodeUrl: string;
  pdfUrl?: string;
}

const certificateSchema = new Schema<ICertificate>(
  {
    certificateId: { type: String, required: true, unique: true },
    user: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    course: { type: Schema.Types.ObjectId, ref: "Course", required: true },
    studentName: { type: String, required: true },
    courseName: { type: String, required: true },
    finalScore: { type: Number, required: true },
    completedAt: { type: Date, required: true },
    qrCodeUrl: { type: String, required: true },
    pdfUrl: String,
  },
  { timestamps: true }
);

// One certificate per user per course, ever  re-completing an already
// completed course (or any other retrigger) must never mint a second one.
certificateSchema.index({ user: 1, course: 1 }, { unique: true });

export const Certificate = model<ICertificate>("Certificate", certificateSchema);
