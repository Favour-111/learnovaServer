// One-off repair for two bugs found in production data:
//  1. Course progress could read over 100% when a lesson was deleted or
//     unpublished after a learner had already completed it (the numerator
//     kept counting it, the denominator didn't).
//  2. A learner could end up with more than one certificate for the same
//     course if course-completion rewards re-fired after the course was
//     already marked complete.
// Safe to re-run  it only recomputes/dedupes, it doesn't grant anything.
import mongoose from "mongoose";
import { connectDB } from "../config/db";
import { Lesson } from "../models/Lesson";
import { LessonProgress } from "../models/LessonProgress";
import { Enrollment } from "../models/Enrollment";
import { Certificate } from "../models/Certificate";

async function main() {
  await connectDB();

  // --- 1. Dedupe certificates (keep the earliest per user+course) ---
  const certificates = await Certificate.find().sort({ createdAt: 1 });
  const seen = new Set<string>();
  let removedCertificates = 0;
  for (const cert of certificates) {
    const key = `${cert.user}:${cert.course}`;
    if (seen.has(key)) {
      await Certificate.deleteOne({ _id: cert._id });
      removedCertificates++;
    } else {
      seen.add(key);
    }
  }

  // --- 2. Recompute every enrollment's progressPercent ---
  const enrollments = await Enrollment.find();
  let fixedEnrollments = 0;
  for (const enrollment of enrollments) {
    const publishedLessonIds = await Lesson.find({ course: enrollment.course, isPublished: true }).distinct("_id");
    const totalLessons = publishedLessonIds.length;
    const completedLessons =
      totalLessons > 0
        ? await LessonProgress.countDocuments({ user: enrollment.user, lesson: { $in: publishedLessonIds }, isCompleted: true })
        : 0;
    const progressPercent = totalLessons > 0 ? Math.min(100, Math.round((completedLessons / totalLessons) * 100)) : 0;
    const isComplete = totalLessons > 0 && completedLessons >= totalLessons;

    if (enrollment.progressPercent !== progressPercent || (isComplete && enrollment.status !== "completed")) {
      enrollment.progressPercent = progressPercent;
      if (isComplete && enrollment.status !== "completed") {
        enrollment.status = "completed";
        enrollment.completedAt = enrollment.completedAt ?? new Date();
      }
      // eslint-disable-next-line no-await-in-loop
      await enrollment.save();
      fixedEnrollments++;
    }
  }

  // eslint-disable-next-line no-console
  console.log(`[fix] removed ${removedCertificates} duplicate certificate(s), corrected ${fixedEnrollments} enrollment(s)`);
  await mongoose.disconnect();
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error("[fix] failed", err);
  process.exit(1);
});
