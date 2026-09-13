# Learnova Backend

Node.js + Express + TypeScript API backing both `learnovaApp` (mobile) and
`admin` (web). This is the only project that talks to MongoDB, Clerk's
secret key, and OpenAI — never expose those to the clients.

## Setup

```bash
cp .env.example .env   # then fill in MONGODB_URI, CLERK_SECRET_KEY, OPENAI_API_KEY, etc.
npm install
npm run seed            # baseline categories + achievements
npm run dev              # http://localhost:4000
```

`GET /health` is a liveness check.

## What's implemented vs. stubbed

**Implemented end to end:** auth (Clerk webhook → Mongo user sync), course
browsing/enrollment, lesson completion with XP/credit rewards (server-side,
farm-proof via a unique `LessonProgress` record + `xpAwarded` gate), quizzes
with server-side scoring, XP/credit ledgers, weekly leaderboard
(compute + weekly settle/reset script), certificates (ID + QR generation,
public verify endpoint), notifications, AI tutor chat, a heuristic career
recommendation endpoint, and a generic CRUD admin API for
courses/modules/lessons/quizzes/questions/projects/categories/achievements.

**Stubbed with clear extension points:**
- `src/services/projectEvaluationPipeline.ts` — repo/zip extraction, static
  analysis, and the isolated Docker sandbox test runner are typed but throw
  "not implemented". The GPT scoring step downstream of them is fully wired
  (`services/openai.ts`). This is real infrastructure (job queue +
  Docker-in-Docker or a managed sandbox) that depends on your deploy target.
- `src/controllers/certificateController.ts#downloadCertificate` — PDF
  generation isn't wired up yet.
- Push notification *sending* (FCM) isn't implemented — tokens are
  collected (`POST /api/notifications/register-token`) but no dispatcher
  exists yet.

## Weekly leaderboard settlement

`npm run cron:settle-leaderboard` freezes the current week, pays out the
top 5 (5000/3500/2500/2000/2000 Credits), notifies them, and opens a new
week. Point your host's scheduled-job feature (or a system crontab) at this
command to run weekly.

## Notes on the stack

Auth runs on **`@clerk/express`**, not `@clerk/clerk-sdk-node` — the latter
was deprecated in October 2024 and its `ClerkExpressRequireAuth()` middleware
crashes the whole process on a real (non-empty) JWT, which manifests as a
504/connection-reset or, once nodemon gives up restarting after a crash, a
misleading 404 on the *next* request. `clerkMiddleware()` is mounted once,
globally, in `app.ts`; `src/middleware/auth.ts`'s `requireAuth`/
`attachDbUser`/`attachDbUserOptional`/`requireAdmin` are thin wrappers around
`getAuth(req)` — every route file already imports those by name, so nothing
else needed to change.

## Connecting clients

Both `learnovaApp` and `admin` reach this API over HTTP only, via
`EXPO_PUBLIC_API_URL` / `NEXT_PUBLIC_API_URL` respectively — see the root
README. Set `CORS_ORIGINS` here to match wherever they're actually running.
