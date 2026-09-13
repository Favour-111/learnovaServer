import mongoose from "mongoose";
import { connectDB } from "../config/db";
import { Project } from "../models/Project";
import { Lesson } from "../models/Lesson";
import { LessonProgress } from "../models/LessonProgress";

async function main() {
  await connectDB();
  const userId = "6a94d1566160b4167650de56";
  const project = await Project.findById("6a9af77d0ca168f344812a21");
  const lessons = await Lesson.find({ module: project!.module, isPublished: true });
  for (const lesson of lessons) {
    await LessonProgress.findOneAndUpdate(
      { user: userId, lesson: lesson._id },
      { $set: { isCompleted: true, course: lesson.course }, $setOnInsert: { user: userId, lesson: lesson._id } },
      { upsert: true }
    );
  }
  console.log(`marked ${lessons.length} lessons complete for temp verification`);
  await mongoose.disconnect();
}
main();
