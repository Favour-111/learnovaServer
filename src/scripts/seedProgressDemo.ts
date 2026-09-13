// One-off dev seed: populates everything the redesigned Progress screen
// needs — a skills-driving spread of enrollments, four real project
// attempts, a couple of unlocked achievements, and two certificates. Safe
// to re-run (everything is upserted by a stable key).
//
// Usage: npm run seed:progress --workspace backend   (or from backend/: npm run seed:progress)
import mongoose from "mongoose";
import { connectDB } from "../config/db";
import { Category } from "../models/Category";
import { Course } from "../models/Course";
import { Module } from "../models/Module";
import { Project } from "../models/Project";
import { ProjectSubmission } from "../models/ProjectSubmission";
import { ProjectAttempt } from "../models/ProjectAttempt";
import { Achievement } from "../models/Achievement";
import { UserAchievement } from "../models/UserAchievement";
import { Certificate } from "../models/Certificate";
import { Enrollment } from "../models/Enrollment";
import { User } from "../models/User";

const DEMO_USER_EMAIL = "omojolaobaloluwa@gmail.com";

// Skills bars on the Progress screen are just each course's own enrollment
// progress, read back through the same title-keyword matching the app
// already uses for course badges — so an "HTML" course needs to exist for
// an "HTML" skill bar to have something real to show.
const HTML_COURSE = {
  slug: "html-fundamentals",
  title: "HTML Fundamentals",
  description: "Semantic markup, forms, and accessibility — the foundation of the web.",
  categorySlug: "development",
  difficulty: "beginner" as const,
  durationMinutes: 200,
  xpReward: 500,
  rating: 4.6,
  ratingCount: 301,
  studentCount: 5100,
  moduleCount: 4,
  lessonCount: 16,
  projectCount: 0,
};

// slug -> progressPercent. Chosen to line up with a real "Skills" tech-bar
// per course (html/css/javascript/react/node), same as the reference.
const SKILL_ENROLLMENTS: Record<string, number> = {
  "javascript-fundamentals": 82,
  "css-grid-mastery": 82,
  "react-development": 48,
  "nodejs-basics": 25,
  "html-fundamentals": 95,
};

const PROJECTS = [
  { title: "Portfolio Website", score: 92 },
  { title: "Weather App", score: 86 },
  { title: "Todo Application", score: 78 },
  { title: "Landing Page", score: 94 },
];

// Certificates are deliberately for courses *not* in SKILL_ENROLLMENTS above,
// so there's no odd "82% complete but also certified" contradiction on screen.
const CERTIFICATES = [
  { courseSlug: "build-a-portfolio-website", finalScore: 92, completedAt: new Date("2026-05-20") },
  { courseSlug: "aws-cloud-practitioner", finalScore: 88, completedAt: new Date("2026-04-10") },
];

const UNLOCKED_ACHIEVEMENT_KEYS = ["streak_7", "first_project", "project_90"];

async function main() {
  await connectDB();

  const category = await Category.findOne({ slug: HTML_COURSE.categorySlug });
  if (!category) {
    // eslint-disable-next-line no-console
    console.warn(`[seed:progress] Category "${HTML_COURSE.categorySlug}" not found — run "npm run seed:dashboard" first.`);
    await mongoose.disconnect();
    return;
  }
  const htmlCourse = await Course.findOneAndUpdate(
    { slug: HTML_COURSE.slug },
    {
      title: HTML_COURSE.title,
      slug: HTML_COURSE.slug,
      description: HTML_COURSE.description,
      category: category._id,
      difficulty: HTML_COURSE.difficulty,
      durationMinutes: HTML_COURSE.durationMinutes,
      xpReward: HTML_COURSE.xpReward,
      isPublished: true,
      hasCertificate: true,
      rating: HTML_COURSE.rating,
      ratingCount: HTML_COURSE.ratingCount,
      studentCount: HTML_COURSE.studentCount,
      moduleCount: HTML_COURSE.moduleCount,
      lessonCount: HTML_COURSE.lessonCount,
      projectCount: HTML_COURSE.projectCount,
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  const user = await User.findOne({ email: DEMO_USER_EMAIL });
  if (!user) {
    // eslint-disable-next-line no-console
    console.warn(`[seed:progress] No user found with email ${DEMO_USER_EMAIL} — sign in with that account once first, then re-run.`);
    await mongoose.disconnect();
    return;
  }

  // Skills enrollments
  for (const [slug, progressPercent] of Object.entries(SKILL_ENROLLMENTS)) {
    // eslint-disable-next-line no-await-in-loop
    const course = await Course.findOne({ slug });
    if (!course) continue;
    // eslint-disable-next-line no-await-in-loop
    await Enrollment.findOneAndUpdate(
      { user: user._id, course: course._id },
      { status: "active", progressPercent, lastActivityAt: new Date(), $setOnInsert: { enrolledAt: new Date() } },
      { upsert: true, setDefaultsOnInsert: true }
    );
  }

  // A single module to hang the four demo projects off of.
  const projectModule = await Module.findOneAndUpdate(
    { course: htmlCourse._id, title: "Demo Projects" },
    { course: htmlCourse._id, title: "Demo Projects", order: 0, isPublished: true },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  for (const p of PROJECTS) {
    // eslint-disable-next-line no-await-in-loop
    const project = await Project.findOneAndUpdate(
      { module: projectModule._id, title: p.title },
      {
        module: projectModule._id,
        course: htmlCourse._id,
        title: p.title,
        description: `Demo project: ${p.title}.`,
        passingScore: 70,
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    // eslint-disable-next-line no-await-in-loop
    const submission = await ProjectSubmission.findOneAndUpdate(
      { user: user._id, project: project._id },
      { user: user._id, project: project._id, status: "evaluated", githubUrl: "https://github.com/demo/demo" },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    // eslint-disable-next-line no-await-in-loop
    await ProjectAttempt.findOneAndUpdate(
      { user: user._id, project: project._id, attemptNumber: 1 },
      {
        user: user._id,
        project: project._id,
        submission: submission._id,
        attemptNumber: 1,
        score: p.score,
        passed: p.score >= 70,
        xpAwarded: 300,
        creditsAwarded: 150,
      },
      { upsert: true, setDefaultsOnInsert: true }
    );
  }

  // Achievements
  const achievements = await Achievement.find({ key: { $in: UNLOCKED_ACHIEVEMENT_KEYS } });
  for (const achievement of achievements) {
    // eslint-disable-next-line no-await-in-loop
    await UserAchievement.findOneAndUpdate(
      { user: user._id, achievement: achievement._id },
      { user: user._id, achievement: achievement._id, unlockedAt: new Date() },
      { upsert: true, setDefaultsOnInsert: true }
    );
  }

  // Certificates
  for (const cert of CERTIFICATES) {
    // eslint-disable-next-line no-await-in-loop
    const course = await Course.findOne({ slug: cert.courseSlug });
    if (!course) continue;
    const certificateId = `LN-${new Date(cert.completedAt).getFullYear()}-${course._id.toString().slice(-6).toUpperCase()}`;
    // eslint-disable-next-line no-await-in-loop
    await Certificate.findOneAndUpdate(
      { user: user._id, course: course._id },
      {
        certificateId,
        user: user._id,
        course: course._id,
        studentName: user.name,
        courseName: course.title,
        finalScore: cert.finalScore,
        completedAt: cert.completedAt,
        qrCodeUrl: `https://learnova.app/verify/${certificateId}`,
      },
      { upsert: true, setDefaultsOnInsert: true }
    );
  }

  // eslint-disable-next-line no-console
  console.log(
    `[seed:progress] seeded HTML course, ${Object.keys(SKILL_ENROLLMENTS).length} skill enrollments, ${PROJECTS.length} project attempts, ${achievements.length} achievement unlocks, ${CERTIFICATES.length} certificates`
  );
  await mongoose.disconnect();
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error("[seed:progress] failed", err);
  process.exit(1);
});
