import { Schema, model, Types } from "mongoose";

export interface IAIEvaluation {
  projectAttempt: Types.ObjectId;
  staticAnalysis: Record<string, unknown>;
  testResults: Record<string, unknown>;
  gptSummary: string;
  strengths: string[];
  areasToImprove: string[];
  detectedIssues: string[];
  recommendations: string[];
  recommendedLessons: Types.ObjectId[];
  rawModelResponse?: string;
  createdAt: Date;
}

const aiEvaluationSchema = new Schema<IAIEvaluation>(
  {
    projectAttempt: { type: Schema.Types.ObjectId, ref: "ProjectAttempt", required: true, index: true },
    staticAnalysis: { type: Schema.Types.Mixed, default: {} },
    testResults: { type: Schema.Types.Mixed, default: {} },
    gptSummary: { type: String, default: "" },
    strengths: { type: [String], default: [] },
    areasToImprove: { type: [String], default: [] },
    detectedIssues: { type: [String], default: [] },
    recommendations: { type: [String], default: [] },
    recommendedLessons: [{ type: Schema.Types.ObjectId, ref: "Lesson" }],
    rawModelResponse: String,
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

export const AIEvaluation = model<IAIEvaluation>("AIEvaluation", aiEvaluationSchema);
