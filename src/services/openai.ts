import OpenAI from "openai";
import { env } from "../config/env";

let client: OpenAI | null = null;

function getClient(): OpenAI {
  if (!env.openaiApiKey) {
    throw new Error("OPENAI_API_KEY is not configured on the server");
  }
  if (!client) {
    client = new OpenAI({ apiKey: env.openaiApiKey, baseURL: env.openaiBaseUrl });
  }
  return client;
}

export type TextAssistAction = "rewrite" | "complete" | "shorten" | "lengthen";

const TEXT_ASSIST_INSTRUCTIONS: Record<TextAssistAction, string> = {
  rewrite: "Rewrite the given text to read more clearly and naturally, keeping the same meaning and roughly the same length.",
  complete: "Continue the given text naturally, extending it with 1-3 more sentences that fit its tone and context.",
  shorten: "Rewrite the given text to be noticeably more concise, keeping only the key meaning.",
  lengthen: "Expand the given text with more detail and richer language, roughly doubling its length.",
};

// Admin-panel writing assist (rewrite/complete/shorten/lengthen) for course,
// lesson, quiz, and achievement copy  a thin single-purpose completion,
// not a chat: no history, just the instruction + the field's current text.
export async function assistText(text: string, action: TextAssistAction): Promise<string> {
  const openai = getClient();
  const response = await openai.chat.completions.create({
    model: env.openaiModel,
    messages: [
      {
        role: "system",
        content: `You are a writing assistant embedded in Learnova's admin panel, helping an admin edit course/lesson copy. ${TEXT_ASSIST_INSTRUCTIONS[action]} Respond with ONLY the resulting text  no preamble, no quotes, no explanation.`,
      },
      { role: "user", content: text },
    ],
  });

  return response.choices[0]?.message?.content?.trim() ?? text;
}

export interface GeneratedQuestion {
  type: "multiple_choice" | "true_false";
  prompt: string;
  options: string[];
  correctOptionIndex?: number;
  correctBoolean?: boolean;
  explanation: string;
}

// Admin "Generate with AI" button on the Quiz/Question page  the admin
// describes what the module covers and gets back a full set of ready-to-save
// questions instead of writing each one by hand. json_object mode + a strict
// shape description keeps the output directly usable without a human
// rewriting it into the right fields first.
export async function generateQuizQuestions(topic: string, count: number): Promise<GeneratedQuestion[]> {
  const openai = getClient();
  const systemPrompt = `You are a curriculum designer creating a quiz for an online learning platform called Learnova.
Generate exactly ${count} quiz questions testing understanding of the given module topic.
Mix "multiple_choice" (4 options) and "true_false" question types, mostly multiple_choice.
Each question must be unambiguous, have exactly one correct answer, and include a short explanation of why that answer is correct.
Respond ONLY with JSON matching this shape:
{
  "questions": [
    {
      "type": "multiple_choice" | "true_false",
      "prompt": string,
      "options": string[] (exactly 4 for multiple_choice, [] for true_false),
      "correctOptionIndex": number (0-based, only for multiple_choice),
      "correctBoolean": boolean (only for true_false),
      "explanation": string
    }
  ]
}`;

  const response = await openai.chat.completions.create({
    model: env.openaiModel,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: `Module topic: ${topic}` },
    ],
  });

  const parsed = JSON.parse(response.choices[0]?.message?.content ?? "{}");
  const questions = Array.isArray(parsed.questions) ? parsed.questions : [];

  return questions
    .filter((q: unknown): q is GeneratedQuestion => {
      const question = q as Partial<GeneratedQuestion>;
      return (
        !!question &&
        (question.type === "multiple_choice" || question.type === "true_false") &&
        typeof question.prompt === "string" &&
        question.prompt.trim().length > 0
      );
    })
    .map((q: GeneratedQuestion) => ({
      type: q.type,
      prompt: q.prompt,
      options: q.type === "true_false" ? [] : Array.isArray(q.options) ? q.options.slice(0, 6) : [],
      correctOptionIndex: q.type === "multiple_choice" ? (q.correctOptionIndex ?? 0) : undefined,
      correctBoolean: q.type === "true_false" ? !!q.correctBoolean : undefined,
      explanation: typeof q.explanation === "string" ? q.explanation : "",
    }));
}

interface TutorContext {
  courseName: string;
  moduleName: string;
  lessonName: string;
  userLevel: number;
}

// AI Tutor: guides, never hands over graded-assignment answers outright.
export async function askTutor(context: TutorContext, question: string, history: { role: "user" | "assistant"; content: string }[]) {
  const openai = getClient();
  const systemPrompt = `You are Learnova AI, a friendly, encouraging tutor inside the Learnova learning app.
Current context: course "${context.courseName}", module "${context.moduleName}", lesson "${context.lessonName}".
The learner is at level ${context.userLevel}. Adapt explanations to that level.
You can explain concepts, simplify ideas, give examples, explain errors, create practice questions, and give hints.
For graded quizzes, exercises, and projects: guide the learner toward the answer with hints and questions of your own 
never simply state the final graded answer.`;

  const response = await openai.chat.completions.create({
    model: env.openaiModel,
    messages: [
      { role: "system", content: systemPrompt },
      ...history,
      { role: "user", content: question },
    ],
  });

  return response.choices[0]?.message?.content ?? "";
}

interface EvaluationFileEvidence {
  path: string;
  content: string;
}

interface EvaluationInput {
  projectTitle: string;
  projectDescription: string;
  // Only these, by key  the AI is explicitly told not to invent
  // requirements or rubric categories beyond what the admin configured.
  requirements: { key: string; label: string }[];
  rubric: { key: string; label: string; weightPercent: number }[];
  // Deterministic, non-AI ground truth (package.json parsing, file
  // presence, required-technology detection)  included so the AI can't
  // contradict objective facts (e.g. claiming "no tests" when test files
  // were found, or "missing React" when package.json lists it).
  automatedChecksSummary: string;
  buildSummary: string;
  // Curated file contents (see services/repoFileFilter.ts)  filtered,
  // size-capped, secrets/binaries/lockfiles/node_modules already excluded
  // before this ever gets built. This is real code, deliberately, so the
  // AI can give genuine code-quality/best-practices/UI-UX feedback; it's
  // the *whole raw repo* that's never sent, not source code categorically.
  files: EvaluationFileEvidence[];
}

export interface EvaluationResult {
  categoryScores: { key: string; label: string; score: number; maxScore: number }[];
  totalScore: number;
  summary: string;
  strengths: string[];
  areasToImprove: string[];
  detectedIssues: string[];
  recommendations: string[];
  requirementResults: { key: string; label: string; status: "met" | "partial" | "not_met"; note: string }[];
}

// Turns curated repo evidence + deterministic automated-check results into
// rubric-weighted scores, per-requirement verification, and human feedback.
// The AI never invents requirements/criteria (only the configured ones are
// even given to it) and never decides the final score  that's always
// recomputed here from the rubric weights, regardless of what the model
// itself might have summed to.
export async function evaluateProjectWithAI(input: EvaluationInput): Promise<EvaluationResult> {
  const openai = getClient();
  const rubricDescription = input.rubric.map((r) => `- ${r.label} (${r.key}): ${r.weightPercent}%`).join("\n");
  const requirementsDescription = input.requirements.map((r) => `- ${r.label} (${r.key})`).join("\n");
  const filesDescription = input.files.map((f) => `--- ${f.path} ---\n${f.content}`).join("\n\n");

  const systemPrompt = `You are Learnova's project evaluator. Evaluate the submitted project STRICTLY against the
requirements and rubric categories given below  do not invent, add, or evaluate against anything not listed here.
You are given a curated (filtered, size-capped) subset of the repository's real files, plus deterministic automated
check results computed by the backend (trust these facts  do not contradict them, e.g. if a dependency is marked
present, do not claim it's missing).

Requirements to verify (mark each as "met", "partial", or "not_met" with a short note):
${requirementsDescription}

Rubric categories to score 0-100 each:
${rubricDescription}

Respond ONLY with JSON matching:
{
  "requirementResults": [{ "key": string, "label": string, "status": "met"|"partial"|"not_met", "note": string }],
  "categoryScores": [{ "key": string, "label": string, "score": number (0-100), "maxScore": 100 }],
  "summary": string,
  "strengths": string[],
  "areasToImprove": string[],
  "detectedIssues": string[],
  "recommendations": string[]
}`;

  const userPrompt = `Project: ${input.projectTitle}
${input.projectDescription}

Automated check results (ground truth  trust these):
${input.automatedChecksSummary}

Build/test run:
${input.buildSummary}

Repository files (filtered subset):
${filesDescription || "(no readable source files were found)"}`;

  const response = await openai.chat.completions.create({
    model: env.openaiModel,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
  });

  const parsed = JSON.parse(response.choices[0]?.message?.content ?? "{}");
  const categoryScores = (parsed.categoryScores ?? []) as EvaluationResult["categoryScores"];
  const requirementResults = (parsed.requirementResults ?? []) as EvaluationResult["requirementResults"];

  // The final score is ALWAYS recomputed here from the configured rubric
  // weights  never trusted from whatever (if anything) the model itself
  // summed to, per Learnova's scoring-integrity requirement.
  const totalScore = Math.round(
    input.rubric.reduce((sum, r) => {
      const match = categoryScores.find((c) => c.key === r.key);
      const score = match ? match.score : 0;
      return sum + (score * r.weightPercent) / 100;
    }, 0)
  );

  return {
    categoryScores,
    totalScore,
    summary: parsed.summary ?? "",
    strengths: parsed.strengths ?? [],
    areasToImprove: parsed.areasToImprove ?? [],
    detectedIssues: parsed.detectedIssues ?? [],
    recommendations: parsed.recommendations ?? [],
    requirementResults,
  };
}
