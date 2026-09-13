import { Response } from "express";
import { Types } from "mongoose";
import { Project } from "../models/Project";
import { ProjectSubmission, EvaluationStage } from "../models/ProjectSubmission";
import { ProjectAttempt } from "../models/ProjectAttempt";
import { AIEvaluation } from "../models/AIEvaluation";
import { Notification } from "../models/Notification";
import { AuthedRequest } from "../middleware/auth";
import { awardXpAndCredits } from "../services/gamification";
import { evaluateAchievements } from "../services/achievements";
import { isModuleComplete } from "../services/moduleAccess";
import { runProjectEvaluation, EvaluationError } from "../services/projectEvaluationPipeline";
import { parseGithubUrl, fetchRepoMeta, fetchLatestCommit } from "../services/github";

export async function getProject(req: AuthedRequest, res: Response) {
  const project = await Project.findById(req.params.id);
  if (!project) return res.status(404).json({ error: "Project not found" });

  let attempts: unknown[] = [];
  // Not signed in => can't have completed anything, so the safest default
  // is locked rather than assuming access.
  let isLocked = true;
  if (req.dbUser) {
    attempts = await ProjectAttempt.find({ user: req.dbUser._id, project: project._id }).sort({ attemptNumber: 1 }).populate("evaluation");
    // Computed BEFORE the populate below — isModuleComplete needs the raw
    // ObjectId, not the populated module document.
    isLocked = !(await isModuleComplete(req.dbUser._id, project.module));
  }

  await project.populate("module", "title");
  res.json({ project, attempts, isLocked });
}

// POST /api/projects/:id/validate-github — lets the mobile submission form
// confirm a repo URL is real and reachable before the student commits to a
// full submission, without spending an attempt.
export async function validateGithubRepo(req: AuthedRequest, res: Response) {
  const { githubUrl } = req.body as { githubUrl?: string };
  if (!githubUrl) return res.status(400).json({ error: "githubUrl is required" });

  const parsed = parseGithubUrl(githubUrl);
  if (!parsed) return res.json({ valid: false, error: "That doesn't look like a valid GitHub repository URL." });

  try {
    const meta = await fetchRepoMeta(parsed);
    const commit = await fetchLatestCommit(parsed, meta.defaultBranch);
    res.json({ valid: true, owner: parsed.owner, repo: parsed.repo, branch: meta.defaultBranch, commitSha: commit.sha });
  } catch (err) {
    res.json({ valid: false, error: err instanceof Error ? err.message : "Couldn't validate this repository." });
  }
}

// POST /api/projects/:id/submit
// Creates the submission and hands it straight back (so the mobile UI can
// show a live "Evaluating…" screen immediately), then runs the actual
// evaluation in the background — GET /api/submissions/:id is what the
// client polls for stage/result. There's no durable job queue behind this
// (no Redis/worker infra in this deployment) — it's an in-process async
// task, which is enough for evaluation runs that take single-digit seconds,
// but won't survive a server restart mid-evaluation (a submission stuck in
// "processing" after a restart can simply be resubmitted).
export async function submitProject(req: AuthedRequest, res: Response) {
  if (!req.dbUser) return res.status(401).json({ error: "Unauthorized" });
  const project = await Project.findById(req.params.id);
  if (!project) return res.status(404).json({ error: "Project not found" });

  // Never trust the client's view of lock state — re-check server-side
  // even if the mobile UI already hid the submit form.
  if (!(await isModuleComplete(req.dbUser._id, project.module))) {
    return res.status(403).json({ error: "Complete all lessons in this module before submitting the project." });
  }

  const existingAttemptCount = await ProjectAttempt.countDocuments({ user: req.dbUser._id, project: project._id });
  if (project.maxAttempts != null && existingAttemptCount >= project.maxAttempts) {
    return res.status(403).json({ error: `Maximum submission attempts (${project.maxAttempts}) reached for this project.` });
  }

  const { githubUrl, demoUrl, notes, branch } = req.body as {
    githubUrl?: string;
    demoUrl?: string;
    notes?: string;
    branch?: string;
  };

  // The MVP evaluation pipeline only knows how to inspect a GitHub repo —
  // project.githubRequired is a display/validation hint for the client,
  // but the backend can't evaluate anything without a repo URL regardless
  // of that flag.
  if (!githubUrl) {
    return res.status(400).json({ error: "A GitHub repository URL is required for this project." });
  }
  if (!parseGithubUrl(githubUrl)) {
    return res.status(400).json({ error: "That doesn't look like a valid GitHub repository URL." });
  }
  if (project.demoUrlRequired && !demoUrl) {
    return res.status(400).json({ error: "A live demo URL is required for this project." });
  }

  const submission = await ProjectSubmission.create({
    user: req.dbUser._id,
    project: project._id,
    githubUrl,
    demoUrl,
    notes,
    status: "processing",
    stage: "validating",
  });

  // Fire-and-forget — internally try/catches everything, so this can never
  // become an unhandled rejection regardless of what fails inside.
  void evaluateSubmission(submission._id, req.dbUser._id, project._id, githubUrl!, branch, existingAttemptCount + 1);

  res.status(202).json({ submission });
}

async function evaluateSubmission(
  submissionId: Types.ObjectId,
  userId: Types.ObjectId,
  projectId: Types.ObjectId,
  githubUrl: string,
  branch: string | undefined,
  attemptNumber: number
) {
  try {
    const [submission, project] = await Promise.all([ProjectSubmission.findById(submissionId), Project.findById(projectId)]);
    if (!submission || !project) return;

    const result = await runProjectEvaluation(project, githubUrl, branch, async (stage: EvaluationStage) => {
      submission.stage = stage;
      await submission.save();
    });

    const { ai, repository, automatedChecksSummary, integrityFlags, buildRun } = result;
    const passed = ai.totalScore >= project.passingScore;

    // Idempotent reward: only the FIRST time this project is passed by this
    // user awards XP/credits — a re-evaluation (even one that passes again,
    // or passes with a higher score) never pays out twice.
    const alreadyPassedBefore = await ProjectAttempt.exists({ user: userId, project: projectId, passed: true });
    const isFirstPass = passed && !alreadyPassedBefore;

    let xpAwarded = 0;
    let creditsAwarded = 0;
    if (isFirstPass) {
      xpAwarded = project.xpReward + (ai.totalScore >= project.bonusXpThreshold ? project.bonusXp : 0);
      creditsAwarded = project.creditReward;
    }

    const reward = isFirstPass && (xpAwarded > 0 || creditsAwarded > 0)
      ? await awardXpAndCredits(userId, xpAwarded, creditsAwarded, "project", "project", projectId)
      : null;

    // ProjectAttempt.evaluation is optional (defaults to null), but
    // AIEvaluation.projectAttempt is required — so the attempt has to exist
    // first. Creating AIEvaluation with a placeholder null (the old order)
    // fails schema validation before it can ever be backfilled.
    const attempt = await ProjectAttempt.create({
      user: userId,
      project: projectId,
      submission: submission._id,
      attemptNumber,
      score: ai.totalScore,
      passed,
      categoryScores: ai.categoryScores.map((c) => ({ ...c, maxScore: 100 })),
      requirementResults: ai.requirementResults,
      branch: repository.branch,
      commitSha: repository.commitSha,
      evaluation: null,
      xpAwarded,
      creditsAwarded,
    });

    const evaluation = await AIEvaluation.create({
      projectAttempt: attempt._id,
      staticAnalysis: { summary: automatedChecksSummary, integrityFlags, repository },
      testResults: buildRun,
      gptSummary: ai.summary,
      strengths: ai.strengths,
      areasToImprove: ai.areasToImprove,
      detectedIssues: ai.detectedIssues,
      recommendations: ai.recommendations,
    });

    attempt.evaluation = evaluation._id;
    await attempt.save();

    // Covers any achievement whose metric is projects_completed/project_score
    // — decided purely from ProjectAttempt history, so this runs on every
    // submission (already idempotent per-achievement via its own reward guard).
    const achievementsUnlocked = await evaluateAchievements(userId, { type: "PROJECT_SUBMITTED" });

    submission.status = "evaluated";
    submission.stage = "completed";
    submission.branch = repository.branch;
    submission.commitSha = repository.commitSha;
    submission.evaluatedAt = new Date();
    submission.integrityFlags = integrityFlags;
    submission.currentAttempt = attempt._id;
    submission.achievementsUnlocked = achievementsUnlocked;
    await submission.save();

    await Notification.create({
      user: userId,
      type: passed ? "project_result" : "project_retry",
      title: passed ? "Project passed!" : "Not quite there yet",
      body: passed
        ? `Your project has been evaluated! You scored ${ai.totalScore}/100 and passed.`
        : `Your project has been evaluated. You scored ${ai.totalScore}/100. Review the feedback and resubmit when you're ready.`,
      data: { projectId, submissionId: submission._id, score: ai.totalScore, achievementsUnlocked: achievementsUnlocked.map((a) => a.key) },
    });
  } catch (err) {
    const submission = await ProjectSubmission.findById(submissionId);
    if (!submission) return;
    submission.status = "failed";
    submission.stage = "failed";
    submission.stageError = err instanceof EvaluationError ? err.message : err instanceof Error ? err.message : "Evaluation failed unexpectedly.";
    await submission.save();
  }
}

// GET /api/submissions/:id — polled by the mobile client while a
// submission is queued/processing to drive the live evaluation-stage UI,
// and once more to render the final result.
export async function getSubmission(req: AuthedRequest, res: Response) {
  if (!req.dbUser) return res.status(401).json({ error: "Unauthorized" });
  const submission = await ProjectSubmission.findById(req.params.id).populate({
    path: "currentAttempt",
    populate: { path: "evaluation" },
  });
  if (!submission) return res.status(404).json({ error: "Submission not found" });
  // A student can only ever see their own submissions — admins use the
  // separate /admin/submissions endpoints, which check role instead.
  if (String(submission.user) !== String(req.dbUser._id)) {
    return res.status(403).json({ error: "Forbidden" });
  }
  res.json({ submission });
}

// GET /api/projects/:id/attempts — full retry history for a project.
export async function getProjectAttempts(req: AuthedRequest, res: Response) {
  if (!req.dbUser) return res.status(401).json({ error: "Unauthorized" });
  const attempts = await ProjectAttempt.find({ user: req.dbUser._id, project: req.params.id })
    .sort({ attemptNumber: 1 })
    .populate("evaluation");
  res.json({ attempts });
}
