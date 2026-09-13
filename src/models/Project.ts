import { Schema, model, Types } from "mongoose";

export interface IRubricCriterion {
  key: string;
  label: string;
  weightPercent: number;
}

// A single checkable requirement — verified (met/partial/not_met) by the
// evaluator, never just by the student submitting. Embedded on Project
// (the definition) and echoed with a status on ProjectAttempt (the result),
// same pattern as `rubric` below.
export interface IProjectRequirement {
  key: string;
  label: string;
}

export interface IProject {
  module: Types.ObjectId;
  course: Types.ObjectId;
  title: string;
  description: string;
  learningObjectives: string[];
  instructions: string;
  requirements: IProjectRequirement[];
  requiredTechnologies: string[];
  optionalTechnologies: string[];
  difficulty: "beginner" | "intermediate" | "advanced";
  estimatedMinutes: number;
  expectedFeatures: string[];
  passingScore: number;
  xpReward: number;
  creditReward: number;
  bonusXpThreshold: number;
  bonusXp: number;
  rubric: IRubricCriterion[];
  submissionMethods: ("github" | "zip" | "url" | "screenshots")[];
  // GitHub-first submission config (the MVP flow) — kept alongside the
  // older submissionMethods list rather than replacing it, since that
  // field predates this feature and other submission types may still use it.
  githubRequired: boolean;
  demoUrlRequired: boolean;
  // null = unlimited attempts.
  maxAttempts: number | null;
}

const rubricCriterionSchema = new Schema<IRubricCriterion>(
  {
    key: { type: String, required: true },
    label: { type: String, required: true },
    weightPercent: { type: Number, required: true },
  },
  { _id: false }
);

const requirementSchema = new Schema<IProjectRequirement>(
  {
    key: { type: String, required: true },
    label: { type: String, required: true },
  },
  { _id: false }
);

const projectSchema = new Schema<IProject>(
  {
    module: { type: Schema.Types.ObjectId, ref: "Module", required: true, unique: true, index: true },
    course: { type: Schema.Types.ObjectId, ref: "Course", required: true, index: true },
    title: { type: String, required: true },
    description: { type: String, required: true },
    learningObjectives: { type: [String], default: [] },
    instructions: { type: String, default: "" },
    requirements: { type: [requirementSchema], default: [] },
    requiredTechnologies: { type: [String], default: [] },
    optionalTechnologies: { type: [String], default: [] },
    difficulty: { type: String, enum: ["beginner", "intermediate", "advanced"], default: "beginner" },
    estimatedMinutes: { type: Number, default: 120 },
    expectedFeatures: { type: [String], default: [] },
    passingScore: { type: Number, default: 70 },
    xpReward: { type: Number, default: 300 },
    creditReward: { type: Number, default: 150 },
    bonusXpThreshold: { type: Number, default: 90 },
    bonusXp: { type: Number, default: 100 },
    rubric: {
      type: [rubricCriterionSchema],
      default: [
        { key: "requirements", label: "Requirements", weightPercent: 30 },
        { key: "functionality", label: "Functionality", weightPercent: 30 },
        { key: "codeQuality", label: "Code Quality", weightPercent: 20 },
        { key: "uiUx", label: "UI/UX", weightPercent: 10 },
        { key: "bestPractices", label: "Best Practices", weightPercent: 10 },
      ],
    },
    submissionMethods: { type: [String], default: ["github"] },
    githubRequired: { type: Boolean, default: true },
    demoUrlRequired: { type: Boolean, default: false },
    maxAttempts: { type: Number, default: null },
  },
  { timestamps: true }
);

export const Project = model<IProject>("Project", projectSchema);
