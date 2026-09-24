import { Schema, model, Types } from "mongoose";

export type NotificationType =
  | "lesson_complete"
  | "course_progress"
  | "project_result"
  | "project_retry"
  | "xp_earned"
  | "level_up"
  | "credits_earned"
  | "leaderboard_position"
  | "leaderboard_result"
  | "certificate_issued"
  | "recommended_course"
  | "streak_reminder"
  | "achievement_unlocked"
  | "new_course"
  | "new_lesson"
  | "announcement";

export interface INotification {
  user: Types.ObjectId;
  type: NotificationType;
  title: string;
  body: string;
  data?: Record<string, unknown>;
  isRead: boolean;
  createdAt: Date;
}

const notificationSchema = new Schema<INotification>(
  {
    user: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    type: { type: String, required: true },
    title: { type: String, required: true },
    body: { type: String, required: true },
    data: { type: Schema.Types.Mixed, default: {} },
    isRead: { type: Boolean, default: false },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

// Powers the Notification Center's list (find by user, sorted newest first).
notificationSchema.index({ user: 1, createdAt: -1 });

// Powers admin's cross-user notification listing, which sorts newest-first
// with no user filter  the compound index above doesn't help there since
// it's keyed on user first.
notificationSchema.index({ createdAt: -1 });

export const Notification = model<INotification>("Notification", notificationSchema);
