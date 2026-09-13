// One-off migration: backfills the new `video` field on lessons created
// before the Dual Video Source feature, which only ever had
// `videoProvider`/`videoId`. Not required for correctness — every read path
// already falls back to those fields via services/video.ts's
// normalizeLessonVideo() — but this keeps the data itself consistent going
// forward (e.g. so a future admin query can filter on `video.type`
// directly). Safe to re-run: only touches lessons where `video` is unset.
import mongoose from "mongoose";
import { connectDB } from "../config/db";
import { Lesson } from "../models/Lesson";

async function main() {
  await connectDB();

  const legacyLessons = await Lesson.find({ video: { $exists: false }, videoProvider: "youtube", videoId: { $exists: true, $ne: "" } });

  for (const lesson of legacyLessons) {
    lesson.video = { type: "youtube", youtube: { videoId: lesson.videoId!, url: `https://www.youtube.com/watch?v=${lesson.videoId}` } };
    // eslint-disable-next-line no-await-in-loop
    await lesson.save();
  }

  // eslint-disable-next-line no-console
  console.log(`[migrate] backfilled video field on ${legacyLessons.length} lesson(s)`);
  await mongoose.disconnect();
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error("[migrate] failed", err);
  process.exit(1);
});
