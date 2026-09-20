import { Types } from "mongoose";
import { Lesson } from "../models/Lesson";
import { LessonProgress } from "../models/LessonProgress";

// A module's project is locked until every published lesson in that module
// has been marked complete by this user. Shared by the course structure
// endpoint (drives the lock icon), the project detail endpoint (drives the
// locked screen for a direct/deep-link visit), and project submission
// (the actual enforcement  the client is never trusted to self-report
// completion).
export async function isModuleComplete(userId: Types.ObjectId | string, moduleId: Types.ObjectId | string): Promise<boolean> {
  const lessonIds = await Lesson.find({ module: moduleId, isPublished: true }).distinct("_id");
  if (lessonIds.length === 0) return true;
  const completedCount = await LessonProgress.countDocuments({
    user: userId,
    lesson: { $in: lessonIds },
    isCompleted: true,
  });
  return completedCount >= lessonIds.length;
}
