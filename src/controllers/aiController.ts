import { Response } from "express";
import { Lesson } from "../models/Lesson";
import { Module } from "../models/Module";
import { Course } from "../models/Course";
import { Enrollment } from "../models/Enrollment";
import { ProjectAttempt } from "../models/ProjectAttempt";
import { QuizAttempt } from "../models/QuizAttempt";
import { AuthedRequest } from "../middleware/auth";
import { askTutor } from "../services/openai";
import { matchCareerPaths } from "../config/careerPaths";

// POST /api/ai/tutor  { lessonId, question, history }
export async function tutorAsk(req: AuthedRequest, res: Response) {
  if (!req.dbUser) return res.status(401).json({ error: "Unauthorized" });
  const { lessonId, question, history } = req.body as {
    lessonId: string;
    question: string;
    history?: { role: "user" | "assistant"; content: string }[];
  };

  const lesson = await Lesson.findById(lessonId).lean();
  if (!lesson) return res.status(404).json({ error: "Lesson not found" });
  const [mod, course] = await Promise.all([Module.findById(lesson.module).lean(), Course.findById(lesson.course).lean()]);

  const answer = await askTutor(
    {
      courseName: course?.title ?? "",
      moduleName: mod?.title ?? "",
      lessonName: lesson.title,
      userLevel: req.dbUser.level,
    },
    question,
    history ?? []
  );

  res.json({ answer });
}

// POST /api/ai/evaluate-project  see routes/projects.ts + services/projectEvaluationPipeline.ts
// for the full pipeline; this is invoked internally by projectController.submitProject.

// GET /api/ai/career-recommendation  only offered once the learner has
// meaningful signal: at least one completed course and a couple of passed
// projects. Never forces a path  purely informational.
export async function careerRecommendation(req: AuthedRequest, res: Response) {
  if (!req.dbUser) return res.status(401).json({ error: "Unauthorized" });

  const [completedCourses, projectAttempts, quizAttempts] = await Promise.all([
    Enrollment.find({ user: req.dbUser._id, status: "completed" }).populate("course").lean(),
    ProjectAttempt.find({ user: req.dbUser._id, passed: true }).lean(),
    QuizAttempt.find({ user: req.dbUser._id }).lean(),
  ]);

  if (completedCourses.length < 1 || projectAttempts.length < 2) {
    return res.json({
      available: false,
      reason: "Complete at least one course and pass two projects to unlock career recommendations.",
    });
  }

  const skills = Array.from(
    new Set(completedCourses.flatMap((e) => (e.course as unknown as { skillsLearned: string[] }).skillsLearned ?? []))
  );

  const avgProjectScore = Math.round(
    projectAttempts.reduce((sum, a) => sum + a.score, 0) / projectAttempts.length
  );
  const avgQuizScore = quizAttempts.length
    ? Math.round(quizAttempts.reduce((sum, a) => sum + a.scorePercent, 0) / quizAttempts.length)
    : 0;

  // NOTE: this can be upgraded to a GPT call (services/openai.ts) once a
  // career-taxonomy prompt is defined in the admin AI configuration; for
  // now it's a transparent skill-overlap heuristic so the endpoint is
  // useful without an extra AI round trip on every profile view.
  const recommendations = matchCareerPaths(skills);

  res.json({
    available: true,
    basedOn: { skills, avgProjectScore, avgQuizScore, coursesCompleted: completedCourses.length },
    recommendations,
    note: "Recommendations are illustrative only  the learner is never required to follow them.",
  });
}
