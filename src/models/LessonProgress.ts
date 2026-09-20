import { Schema, model, Types } from "mongoose";

export interface ILessonProgress {
  user: Types.ObjectId;
  lesson: Types.ObjectId;
  course: Types.ObjectId;
  isCompleted: boolean;
  isBookmarked: boolean;
  completedAt?: Date;
  xpAwarded: boolean;
  // Video watch-progress  furthest point reached (watchedSeconds, used for
  // the "90% watched" completion rule) vs. where playback last was
  // (lastPositionSeconds, used to resume on return  a learner who seeks
  // back to rewatch shouldn't lose completion credit for the far point).
  watchedSeconds: number;
  lastPositionSeconds: number;
  durationSeconds: number;
  // Snapshot of watchedSeconds as of the first progress update on a given
  // calendar day (UTC, YYYY-MM-DD)  lets the auto-complete-at-90% path
  // (updateLessonProgress) tell "genuinely watched more today" apart from
  // "resumed a lesson already near-done from a previous day and one tick
  // pushed the old cumulative total over the line." See the comment there.
  watchDayCheckpointDate?: string;
  watchDayCheckpointSeconds?: number;
}

const lessonProgressSchema = new Schema<ILessonProgress>(
  {
    user: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    lesson: { type: Schema.Types.ObjectId, ref: "Lesson", required: true, index: true },
    course: { type: Schema.Types.ObjectId, ref: "Course", required: true, index: true },
    isCompleted: { type: Boolean, default: false },
    isBookmarked: { type: Boolean, default: false },
    completedAt: Date,
    xpAwarded: { type: Boolean, default: false },
    watchedSeconds: { type: Number, default: 0 },
    lastPositionSeconds: { type: Number, default: 0 },
    durationSeconds: { type: Number, default: 0 },
    watchDayCheckpointDate: String,
    watchDayCheckpointSeconds: { type: Number, default: 0 },
  },
  { timestamps: true }
);

// One progress record per user+lesson  this is also what prevents XP farming:
// XP is only ever granted the first time xpAwarded flips to true.
lessonProgressSchema.index({ user: 1, lesson: 1 }, { unique: true });

export const LessonProgress = model<ILessonProgress>("LessonProgress", lessonProgressSchema);
