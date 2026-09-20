import { Response } from "express";
import { Types } from "mongoose";
import { Quiz } from "../models/Quiz";
import { Question } from "../models/Question";
import { QuizAttempt } from "../models/QuizAttempt";
import { Project } from "../models/Project";
import { AuthedRequest } from "../middleware/auth";
import { awardXpAndCredits } from "../services/gamification";
import { evaluateAchievements, recordDailyActivity } from "../services/achievements";

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 50;

// GET /api/quizzes?category=&search=&courseId=&page=&limit=  the Quiz
// Library / Explore's "Quizzes" section / a course's "Course Quiz" list.
// Mirrors listCourses' pagination shape exactly (page/limit optional 
// omitting them gives the old "small bounded set" behavior for callers
// like Home's recommendations that just want a handful).
export async function listQuizzes(req: AuthedRequest, res: Response) {
  const { category, search, courseId, page, limit } = req.query as Record<string, string | undefined>;
  // Not `{ isPublished: true }`  this is a raw MongoDB query filter, not a
  // Mongoose document read, so the schema's `default: true` never applies
  // to it: a quiz saved before this field existed has no isPublished key
  // in storage at all, and `{ isPublished: true }` only matches documents
  // that actually *have* that key set to true, silently excluding every
  // pre-existing quiz. `$ne: false` matches true OR absent, which is the
  // real intent (published unless explicitly unpublished).
  const filter: Record<string, unknown> = { isPublished: { $ne: false } };
  if (category) filter.category = category;
  if (courseId) filter.course = courseId;
  if (search) filter.title = { $regex: search, $options: "i" };

  const query = Quiz.find(filter).populate("category").sort({ createdAt: -1 });

  const pageSize = Math.min(Math.max(Number(limit) || DEFAULT_PAGE_SIZE, 1), MAX_PAGE_SIZE);
  const pageNumber = Math.max(Number(page) || 1, 1);
  const isPaginated = page != null || limit != null;

  const [quizzes, total] = await Promise.all([
    isPaginated ? query.skip((pageNumber - 1) * pageSize).limit(pageSize) : query.limit(50),
    isPaginated ? Quiz.countDocuments(filter) : Promise.resolve(undefined),
  ]);

  const quizIds = quizzes.map((q) => q._id);
  const [questionCounts, bestScores] = await Promise.all([
    Question.aggregate<{ _id: Types.ObjectId; count: number }>([
      { $match: { quiz: { $in: quizIds } } },
      { $group: { _id: "$quiz", count: { $sum: 1 } } },
    ]),
    req.dbUser
      ? QuizAttempt.aggregate<{ _id: Types.ObjectId; best: number }>([
          { $match: { user: req.dbUser._id, quiz: { $in: quizIds } } },
          { $group: { _id: "$quiz", best: { $max: "$scorePercent" } } },
        ])
      : Promise.resolve([]),
  ]);
  const questionCountByQuiz = new Map(questionCounts.map((q) => [String(q._id), q.count]));
  const bestScoreByQuiz = new Map(bestScores.map((b) => [String(b._id), b.best]));

  const quizzesJson = quizzes.map((q) => ({
    ...q.toObject(),
    questionCount: questionCountByQuiz.get(String(q._id)) ?? 0,
    bestScorePercent: bestScoreByQuiz.get(String(q._id)) ?? null,
  }));

  res.json({
    quizzes: quizzesJson,
    ...(isPaginated ? { page: pageNumber, limit: pageSize, total, hasMore: pageNumber * pageSize < (total ?? 0) } : {}),
  });
}

// GET /api/quizzes/attempts/me  every attempt the current user has ever
// made, newest first, for the Progress screen's Quiz History.
export async function getMyQuizAttempts(req: AuthedRequest, res: Response) {
  if (!req.dbUser) return res.status(401).json({ error: "Unauthorized" });
  const attempts = await QuizAttempt.find({ user: req.dbUser._id })
    .sort({ createdAt: -1 })
    .populate({
      path: "quiz",
      select: "title description estimatedMinutes imageUrl category",
      populate: { path: "category", select: "name slug imageUrl" },
    });
  // An attempt can outlive the quiz it was taken on (e.g. an admin deletes
  // it later)  populate leaves `quiz` null in that case, which the client
  // isn't built to render, so drop those rather than sending broken rows.
  res.json({ attempts: attempts.filter((a) => a.quiz != null) });
}

// GET /api/quizzes/stats/me  the Progress screen's Quiz Performance card.
export async function getMyQuizStats(req: AuthedRequest, res: Response) {
  if (!req.dbUser) return res.status(401).json({ error: "Unauthorized" });
  const [agg] = await QuizAttempt.aggregate<{ _id: null; avg: number; taken: number; passed: number; best: number }>([
    { $match: { user: req.dbUser._id } },
    { $group: { _id: null, avg: { $avg: "$scorePercent" }, taken: { $sum: 1 }, passed: { $sum: { $cond: ["$passed", 1, 0] } }, best: { $max: "$scorePercent" } } },
  ]);
  res.json({
    averageScore: agg ? Math.round(agg.avg) : 0,
    quizzesTaken: agg?.taken ?? 0,
    quizzesPassed: agg?.passed ?? 0,
    bestScore: agg?.best ?? 0,
  });
}

export async function getQuiz(req: AuthedRequest, res: Response) {
  const quiz = await Quiz.findById(req.params.id).populate("category");
  if (!quiz) return res.status(404).json({ error: "Quiz not found" });
  if (!quiz.isPublished && req.dbUser?.role !== "admin") return res.status(404).json({ error: "Quiz not found" });

  // Correct answers are stripped before sending to the client.
  const questions = await Question.find({ quiz: quiz._id })
    .sort({ order: 1 })
    .select("-correctOptionIndex -correctBoolean");
  // Surfaced so the mobile results screen can offer a "Start Project"
  // button straight off the back of passing this module's quiz  the
  // project screen itself still enforces (and shows) the lesson-completion
  // lock, this is just "does one exist for this module at all". Only
  // applies to module quizzes; a standalone quiz has no module to match.
  const project = quiz.module ? await Project.findOne({ module: quiz.module }).select("_id title") : null;

  let bestScorePercent: number | null = null;
  let attemptsCount = 0;
  if (req.dbUser) {
    const [best, count] = await Promise.all([
      QuizAttempt.findOne({ user: req.dbUser._id, quiz: quiz._id }).sort({ scorePercent: -1 }).select("scorePercent"),
      QuizAttempt.countDocuments({ user: req.dbUser._id, quiz: quiz._id }),
    ]);
    bestScorePercent = best?.scorePercent ?? null;
    attemptsCount = count;
  }

  res.json({ quiz, questions, project, bestScorePercent, attemptsCount });
}

interface SubmitAnswer {
  questionId: string;
  selectedOptionIndex?: number;
  selectedBoolean?: boolean;
}

// POST /api/quizzes/:id/submit  scoring happens entirely server-side
// against the stored correct answers; the client only ever sends selections.
export async function submitQuiz(req: AuthedRequest, res: Response) {
  if (!req.dbUser) return res.status(401).json({ error: "Unauthorized" });
  const quiz = await Quiz.findById(req.params.id);
  if (!quiz) return res.status(404).json({ error: "Quiz not found" });

  const { answers } = req.body as { answers: SubmitAnswer[] };
  const questions = await Question.find({ quiz: quiz._id });

  let correctCount = 0;
  for (const q of questions) {
    const given = answers.find((a) => a.questionId === String(q._id));
    if (!given) continue;
    if (q.type === "true_false") {
      if (given.selectedBoolean === q.correctBoolean) correctCount++;
    } else if (given.selectedOptionIndex === q.correctOptionIndex) {
      correctCount++;
    }
  }

  const scorePercent = questions.length > 0 ? Math.round((correctCount / questions.length) * 100) : 0;
  const passed = scorePercent >= quiz.passingScorePercent;

  // Best score prior to THIS submission  read before the new attempt is
  // written, so "did this attempt set a new best" and "how many times has
  // this been passed before" both reflect state strictly before this one.
  const [previousBest, alreadyPassedBefore, attemptNumber] = await Promise.all([
    QuizAttempt.findOne({ user: req.dbUser._id, quiz: quiz._id }).sort({ scorePercent: -1 }).select("scorePercent"),
    QuizAttempt.exists({ user: req.dbUser._id, quiz: quiz._id, passed: true }),
    QuizAttempt.countDocuments({ user: req.dbUser._id, quiz: quiz._id }).then((n) => n + 1),
  ]);
  const previousBestPercent = previousBest?.scorePercent ?? null;
  const isNewBest = passed && (previousBestPercent === null || scorePercent > previousBestPercent);

  // XP/credits only ever pay out once per quiz, on the first passing
  // attempt  otherwise a learner could replay an already-passed quiz
  // indefinitely to farm XP. Retrying is never blocked and always scored/
  // reviewed normally; it just doesn't re-pay a reward already collected.
  const xpToAward = passed && !alreadyPassedBefore ? quiz.xpReward : 0;
  const creditsToAward = passed && !alreadyPassedBefore ? quiz.creditReward : 0;

  const reward = xpToAward > 0 || creditsToAward > 0
    ? await awardXpAndCredits(req.dbUser._id, xpToAward, creditsToAward, "quiz", "quiz", quiz._id)
    : null;

  const attempt = await QuizAttempt.create({
    user: req.dbUser._id,
    quiz: quiz._id,
    answers: answers.map((a) => ({
      question: a.questionId,
      selectedOptionIndex: a.selectedOptionIndex,
      selectedBoolean: a.selectedBoolean,
    })),
    scorePercent,
    passed,
    xpAwarded: xpToAward,
    creditsAwarded: creditsToAward,
    attemptNumber,
  });

  // A quiz attempt is learning activity same as finishing a lesson  keeps
  // the daily streak alive on a day where the learner only took quizzes.
  await recordDailyActivity(req.dbUser._id);

  const withExplanations = questions.map((q) => ({
    questionId: q._id,
    correctOptionIndex: q.correctOptionIndex,
    correctBoolean: q.correctBoolean,
    explanation: q.explanation,
  }));

  const achievementsUnlocked = await evaluateAchievements(req.dbUser._id, { type: passed ? "QUIZ_PASSED" : "QUIZ_COMPLETED" });

  res.json({
    attempt,
    scorePercent,
    passed,
    reward,
    previousBestPercent,
    isNewBest,
    explanations: withExplanations,
    achievementsUnlocked,
  });
}
