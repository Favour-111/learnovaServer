import { Response } from "express";
import { Quiz } from "../models/Quiz";
import { Question } from "../models/Question";
import { QuizAttempt } from "../models/QuizAttempt";
import { Project } from "../models/Project";
import { AuthedRequest } from "../middleware/auth";
import { awardXpAndCredits } from "../services/gamification";
import { evaluateAchievements } from "../services/achievements";

export async function getQuiz(req: AuthedRequest, res: Response) {
  const quiz = await Quiz.findById(req.params.id);
  if (!quiz) return res.status(404).json({ error: "Quiz not found" });
  // Correct answers are stripped before sending to the client.
  const questions = await Question.find({ quiz: quiz._id })
    .sort({ order: 1 })
    .select("-correctOptionIndex -correctBoolean");
  // Surfaced so the mobile results screen can offer a "Start Project"
  // button straight off the back of passing this module's quiz — the
  // project screen itself still enforces (and shows) the lesson-completion
  // lock, this is just "does one exist for this module at all".
  const project = await Project.findOne({ module: quiz.module }).select("_id title");
  res.json({ quiz, questions, project });
}

interface SubmitAnswer {
  questionId: string;
  selectedOptionIndex?: number;
  selectedBoolean?: boolean;
}

// POST /api/quizzes/:id/submit — scoring happens entirely server-side
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
  const attemptNumber = (await QuizAttempt.countDocuments({ user: req.dbUser._id, quiz: quiz._id })) + 1;

  const xpToAward = passed ? quiz.xpReward : 0;
  const creditsToAward = passed ? quiz.creditReward : 0;

  const reward = passed
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

  const withExplanations = questions.map((q) => ({
    questionId: q._id,
    correctOptionIndex: q.correctOptionIndex,
    correctBoolean: q.correctBoolean,
    explanation: q.explanation,
  }));

  const achievementsUnlocked = await evaluateAchievements(req.dbUser._id, { type: passed ? "QUIZ_PASSED" : "QUIZ_COMPLETED" });

  res.json({ attempt, scorePercent, passed, reward, explanations: withExplanations, achievementsUnlocked });
}
