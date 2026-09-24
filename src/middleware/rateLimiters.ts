import rateLimit from "express-rate-limit";

// The global limiter in app.ts (300 req/15min on all of /api) is the outer
// bound for everything. These are tighter, endpoint-specific limits layered
// on top for routes where abuse is either expensive (AI calls cost real
// money per request) or specifically sensitive (submissions, admin actions)
// than a normal read-heavy GET.
const WINDOW_MS = 15 * 60 * 1000;

function limiterOptions(limit: number) {
  return { windowMs: WINDOW_MS, limit, standardHeaders: true, legacyHeaders: false } as const;
}

// AI endpoints (OpenAI-backed: tutor, career recommendation, admin's
// rewrite/complete/shorten/lengthen assist, quiz/question generation)
// each of these costs real money per call and is meaningfully slower than a
// normal DB-backed endpoint, so it gets the tightest budget.
export const aiLimiter = rateLimit(limiterOptions(20));

// Quiz/project submission and GitHub-repo validation  scoring runs
// server-side and project evaluation kicks off a real pipeline (repo fetch,
// automated checks, AI evaluation), so this is deliberately tighter than
// plain reads even though it's not as expensive as the AI tier above.
export const submissionLimiter = rateLimit(limiterOptions(30));

// Blanket limiter for the whole /admin router, layered under the global
// /api limiter  admins do a lot of legitimate listing/CRUD traffic, but a
// compromised admin session or a runaway script should still hit a tighter
// ceiling than an ordinary learner's read traffic.
export const adminLimiter = rateLimit(limiterOptions(150));

// Inbound webhooks (Clerk user sync, AWS MediaConvert job-status callbacks)
// are server-to-server and already signature/secret-verified, but still
// bounded in case a URL leaks or a sender misbehaves.
export const webhookLimiter = rateLimit(limiterOptions(60));
