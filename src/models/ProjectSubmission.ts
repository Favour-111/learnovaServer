import { Schema, model, Types } from "mongoose";

// The granular evaluation lifecycle a client can poll — status stays the
// coarse queued/processing/evaluated/failed summary (used for filtering/
// indexing), stage is the fine-grained "what's happening right now" the
// mobile "Evaluating your project…" screen renders.
export type EvaluationStage =
  | "validating"
  | "fetching_repository"
  | "analyzing"
  | "running_tests"
  | "ai_review"
  | "calculating_score"
  | "completed"
  | "failed";

export interface IProjectSubmission {
  user: Types.ObjectId;
  project: Types.ObjectId;
  githubUrl?: string;
  demoUrl?: string;
  notes?: string;
  zipFileKey?: string;
  screenshotUrls: string[];
  status: "queued" | "processing" | "evaluated" | "failed";
  stage: EvaluationStage;
  stageError?: string;
  // The exact repository state that was evaluated — a later push to the
  // same repo must never make an old score look like it represents new code.
  branch?: string;
  commitSha?: string;
  evaluatedAt?: Date;
  // Non-accusatory integrity signals for admin review (see services/
  // projectAutomatedChecks.ts) — never auto-rejects a submission on its own.
  integrityFlags: string[];
  currentAttempt: Types.ObjectId | null;
  // Achievements unlocked by THIS evaluation specifically (evaluateAchievements
  // returns [] on a re-check that unlocked nothing new) — stashed here so the
  // mobile client, which learns the result via polling rather than an inline
  // mutation response, can still show the unlock-celebration modal exactly
  // once per real unlock.
  achievementsUnlocked: Array<{ key: string; name: string; description: string; icon: string; category: string; reward: { xp: number; credits: number } }>;
  adminReview: {
    reviewed: boolean;
    note?: string;
    overriddenScore?: number;
    overriddenPassed?: boolean;
    reviewedBy?: Types.ObjectId;
    reviewedAt?: Date;
  };
  createdAt: Date;
}

const projectSubmissionSchema = new Schema<IProjectSubmission>(
  {
    user: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    project: { type: Schema.Types.ObjectId, ref: "Project", required: true, index: true },
    githubUrl: String,
    demoUrl: String,
    notes: String,
    zipFileKey: String,
    screenshotUrls: { type: [String], default: [] },
    status: { type: String, enum: ["queued", "processing", "evaluated", "failed"], default: "queued" },
    stage: {
      type: String,
      enum: ["validating", "fetching_repository", "analyzing", "running_tests", "ai_review", "calculating_score", "completed", "failed"],
      default: "validating",
    },
    stageError: String,
    branch: String,
    commitSha: String,
    evaluatedAt: Date,
    integrityFlags: { type: [String], default: [] },
    currentAttempt: { type: Schema.Types.ObjectId, ref: "ProjectAttempt", default: null },
    achievementsUnlocked: { type: Schema.Types.Mixed, default: [] },
    adminReview: {
      reviewed: { type: Boolean, default: false },
      note: String,
      overriddenScore: Number,
      overriddenPassed: Boolean,
      reviewedBy: { type: Schema.Types.ObjectId, ref: "User" },
      reviewedAt: Date,
    },
  },
  { timestamps: { createdAt: true, updatedAt: true } }
);

export const ProjectSubmission = model<IProjectSubmission>("ProjectSubmission", projectSubmissionSchema);
