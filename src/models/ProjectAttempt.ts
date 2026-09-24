import { Schema, model, Types } from "mongoose";

export interface IRequirementResult {
  key: string;
  label: string;
  status: "met" | "partial" | "not_met";
  note?: string;
}

export interface IProjectAttempt {
  user: Types.ObjectId;
  project: Types.ObjectId;
  submission: Types.ObjectId;
  attemptNumber: number;
  score: number;
  passed: boolean;
  categoryScores: { key: string; label: string; score: number; maxScore: number }[];
  requirementResults: IRequirementResult[];
  branch?: string;
  commitSha?: string;
  evaluation: Types.ObjectId | null;
  xpAwarded: number;
  creditsAwarded: number;
  createdAt: Date;
}

const projectAttemptSchema = new Schema<IProjectAttempt>(
  {
    user: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    project: { type: Schema.Types.ObjectId, ref: "Project", required: true, index: true },
    submission: { type: Schema.Types.ObjectId, ref: "ProjectSubmission", required: true },
    attemptNumber: { type: Number, required: true },
    score: { type: Number, required: true },
    passed: { type: Boolean, required: true },
    categoryScores: [
      {
        key: String,
        label: String,
        score: Number,
        maxScore: Number,
        _id: false,
      },
    ],
    requirementResults: [
      {
        key: String,
        label: String,
        status: { type: String, enum: ["met", "partial", "not_met"] },
        note: String,
        _id: false,
      },
    ],
    branch: String,
    commitSha: String,
    evaluation: { type: Schema.Types.ObjectId, ref: "AIEvaluation", default: null },
    xpAwarded: { type: Number, default: 0 },
    creditsAwarded: { type: Number, default: 0 },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

// Powers getProjectAttempts and the admin submission-detail view, both of
// which filter by this exact user+project pair.
projectAttemptSchema.index({ user: 1, project: 1 });

export const ProjectAttempt = model<IProjectAttempt>("ProjectAttempt", projectAttemptSchema);
