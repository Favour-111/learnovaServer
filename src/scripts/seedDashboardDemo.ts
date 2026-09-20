// One-off dev seed: populates the Home dashboard with data you can see and
// work with  a handful of courses, category tags, enrollments in progress,
// today's daily goal, and XP/credits/streak on one named account. Safe to
// re-run (everything is upserted by a stable key).
//
// Usage: npm run seed:dashboard --workspace backend   (or from backend/: npm run seed:dashboard)
import mongoose from "mongoose";
import { connectDB } from "../config/db";
import { Category } from "../models/Category";
import { Course } from "../models/Course";
import { User } from "../models/User";
import { Enrollment } from "../models/Enrollment";
import { DailyGoal } from "../models/DailyGoal";

// The account the "put credits and xp for me" request refers to. Must
// already exist (created by the Clerk sign-in webhook)  we only ever
// update it by email, never create a fake user, so a real sign-in never
// collides with a seeded duplicate.
const DEMO_USER_EMAIL = "omojolaobaloluwa@gmail.com";

const CATEGORIES = [
  { name: "Development", slug: "development", icon: "code", colorToken: "blue" },
  { name: "Mobile", slug: "mobile", icon: "smartphone", colorToken: "purple" },
  { name: "AI", slug: "ai", icon: "sparkles", colorToken: "pink" },
  { name: "Data Science", slug: "data-science", icon: "bar-chart", colorToken: "green" },
  { name: "Cybersecurity", slug: "cybersecurity", icon: "shield", colorToken: "orange" },
  { name: "Design", slug: "design", icon: "palette", colorToken: "lavender" },
  { name: "Cloud", slug: "cloud", icon: "cloud", colorToken: "blue" },
  { name: "Business", slug: "business", icon: "briefcase", colorToken: "yellow" },
];

const COURSES: Array<{
  slug: string;
  title: string;
  description: string;
  categorySlug: string;
  difficulty: "beginner" | "intermediate" | "advanced";
  durationMinutes: number;
  xpReward: number;
  rating: number;
  ratingCount: number;
  studentCount: number;
  moduleCount: number;
  lessonCount: number;
  projectCount: number;
}> = [
  {
    slug: "javascript-fundamentals",
    title: "JavaScript Fundamentals",
    description: "Variables, Data Types & Functions  the core building blocks of JavaScript.",
    categorySlug: "development",
    difficulty: "beginner",
    durationMinutes: 320,
    xpReward: 800,
    rating: 4.7,
    ratingCount: 412,
    studentCount: 6200,
    moduleCount: 6,
    lessonCount: 28,
    projectCount: 1,
  },
  {
    slug: "react-development",
    title: "React Development",
    description: "Build interactive UIs with components, hooks, and state management.",
    categorySlug: "development",
    difficulty: "intermediate",
    durationMinutes: 540,
    xpReward: 1400,
    rating: 4.6,
    ratingCount: 298,
    studentCount: 4100,
    moduleCount: 8,
    lessonCount: 34,
    projectCount: 2,
  },
  {
    slug: "nodejs-basics",
    title: "Node.js Basics",
    description: "Server-side JavaScript with Express, REST APIs, and databases.",
    categorySlug: "development",
    difficulty: "beginner",
    durationMinutes: 360,
    xpReward: 900,
    rating: 4.5,
    ratingCount: 231,
    studentCount: 3300,
    moduleCount: 6,
    lessonCount: 24,
    projectCount: 1,
  },
  {
    slug: "build-a-portfolio-website",
    title: "Build a Portfolio Website",
    description: "Intermediate project: design, build, and ship your personal portfolio site.",
    categorySlug: "development",
    difficulty: "intermediate",
    durationMinutes: 240,
    xpReward: 1000,
    rating: 4.8,
    ratingCount: 187,
    studentCount: 2600,
    moduleCount: 4,
    lessonCount: 14,
    projectCount: 1,
  },
  {
    slug: "css-grid-mastery",
    title: "CSS Grid Mastery",
    description: "Advanced layout techniques with CSS Grid, from fundamentals to real layouts.",
    categorySlug: "design",
    difficulty: "advanced",
    durationMinutes: 200,
    xpReward: 700,
    rating: 4.9,
    ratingCount: 156,
    studentCount: 1900,
    moduleCount: 5,
    lessonCount: 18,
    projectCount: 0,
  },
  {
    slug: "javascript-dom-mastery",
    title: "JavaScript DOM Mastery",
    description: "Deep dive into DOM manipulation, events, and browser APIs.",
    categorySlug: "development",
    difficulty: "advanced",
    durationMinutes: 260,
    xpReward: 850,
    rating: 4.8,
    ratingCount: 203,
    studentCount: 2400,
    moduleCount: 5,
    lessonCount: 20,
    projectCount: 0,
  },
  {
    slug: "ethical-hacking-fundamentals",
    title: "Ethical Hacking Fundamentals",
    description: "Learn how attackers think  reconnaissance, common exploits, and how to defend against them.",
    categorySlug: "cybersecurity",
    difficulty: "beginner",
    durationMinutes: 300,
    xpReward: 900,
    rating: 4.6,
    ratingCount: 174,
    studentCount: 2100,
    moduleCount: 6,
    lessonCount: 22,
    projectCount: 1,
  },
  {
    slug: "network-security-essentials",
    title: "Network Security Essentials",
    description: "Firewalls, VPNs, and secure network design for real-world infrastructure.",
    categorySlug: "cybersecurity",
    difficulty: "intermediate",
    durationMinutes: 280,
    xpReward: 950,
    rating: 4.7,
    ratingCount: 132,
    studentCount: 1500,
    moduleCount: 5,
    lessonCount: 19,
    projectCount: 1,
  },
  {
    slug: "machine-learning-basics",
    title: "Machine Learning Basics",
    description: "Core ML concepts  regression, classification, and training your first models.",
    categorySlug: "ai",
    difficulty: "intermediate",
    durationMinutes: 420,
    xpReward: 1300,
    rating: 4.8,
    ratingCount: 265,
    studentCount: 3800,
    moduleCount: 7,
    lessonCount: 26,
    projectCount: 2,
  },
  {
    slug: "python-for-data-science",
    title: "Python for Data Science",
    description: "Analyze real datasets with Python, pandas, and visualization libraries.",
    categorySlug: "data-science",
    difficulty: "beginner",
    durationMinutes: 340,
    xpReward: 1000,
    rating: 4.7,
    ratingCount: 221,
    studentCount: 3200,
    moduleCount: 6,
    lessonCount: 24,
    projectCount: 1,
  },
  {
    slug: "react-native-fundamentals",
    title: "React Native Fundamentals",
    description: "Build cross-platform mobile apps for iOS and Android with React Native.",
    categorySlug: "mobile",
    difficulty: "intermediate",
    durationMinutes: 460,
    xpReward: 1350,
    rating: 4.7,
    ratingCount: 189,
    studentCount: 2700,
    moduleCount: 7,
    lessonCount: 28,
    projectCount: 2,
  },
  {
    slug: "aws-cloud-practitioner",
    title: "AWS Cloud Practitioner",
    description: "Get hands-on with core AWS services  compute, storage, and deployment basics.",
    categorySlug: "cloud",
    difficulty: "beginner",
    durationMinutes: 300,
    xpReward: 900,
    rating: 4.6,
    ratingCount: 143,
    studentCount: 1900,
    moduleCount: 6,
    lessonCount: 20,
    projectCount: 1,
  },
  {
    slug: "product-management-basics",
    title: "Product Management Basics",
    description: "Prioritization, roadmaps, and shipping products people actually want.",
    categorySlug: "business",
    difficulty: "beginner",
    durationMinutes: 220,
    xpReward: 700,
    rating: 4.5,
    ratingCount: 98,
    studentCount: 1400,
    moduleCount: 4,
    lessonCount: 16,
    projectCount: 0,
  },
];

// slug -> desired progressPercent for the demo user's enrollments.
// (javascript-fundamentals is the highest, so it's what "Continue Learning" surfaces.)
const ENROLLMENTS: Record<string, number> = {
  "javascript-fundamentals": 82,
  "react-development": 42,
  "nodejs-basics": 28,
};

async function main() {
  await connectDB();

  const categoryIdBySlug = new Map<string, mongoose.Types.ObjectId>();
  for (const c of CATEGORIES) {
    // eslint-disable-next-line no-await-in-loop
    const doc = await Category.findOneAndUpdate({ slug: c.slug }, c, { upsert: true, new: true });
    categoryIdBySlug.set(c.slug, doc._id);
  }

  const courseIdBySlug = new Map<string, mongoose.Types.ObjectId>();
  for (const c of COURSES) {
    const categoryId = categoryIdBySlug.get(c.categorySlug);
    if (!categoryId) continue;
    // eslint-disable-next-line no-await-in-loop
    const doc = await Course.findOneAndUpdate(
      { slug: c.slug },
      {
        title: c.title,
        slug: c.slug,
        description: c.description,
        category: categoryId,
        difficulty: c.difficulty,
        durationMinutes: c.durationMinutes,
        xpReward: c.xpReward,
        isPublished: true,
        hasCertificate: true,
        rating: c.rating,
        ratingCount: c.ratingCount,
        studentCount: c.studentCount,
        moduleCount: c.moduleCount,
        lessonCount: c.lessonCount,
        projectCount: c.projectCount,
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    courseIdBySlug.set(c.slug, doc._id);
  }

  const user = await User.findOne({ email: DEMO_USER_EMAIL });
  if (!user) {
    // eslint-disable-next-line no-console
    console.warn(
      `[seed:dashboard] No user found with email ${DEMO_USER_EMAIL}  courses/categories were seeded, ` +
        `but XP/credits/enrollments were skipped. Sign in with that account once first, then re-run this script.`
    );
  } else {
    user.xp = 4850;
    user.credits = 1240;
    user.streakDays = 7;
    user.lastActiveAt = new Date();
    await user.save();

    for (const [slug, progressPercent] of Object.entries(ENROLLMENTS)) {
      const courseId = courseIdBySlug.get(slug);
      if (!courseId) continue;
      // eslint-disable-next-line no-await-in-loop
      await Enrollment.findOneAndUpdate(
        { user: user._id, course: courseId },
        {
          status: "active",
          progressPercent,
          lastActivityAt: new Date(),
          $setOnInsert: { enrolledAt: new Date() },
        },
        { upsert: true, setDefaultsOnInsert: true }
      );
    }

    const today = new Date().toISOString().slice(0, 10);
    await DailyGoal.findOneAndUpdate(
      { user: user._id, date: today },
      { targetLessons: 4, completedLessons: 3 },
      { upsert: true }
    );

    // eslint-disable-next-line no-console
    console.log(`[seed:dashboard] updated ${DEMO_USER_EMAIL}: xp=4850, credits=1240, streakDays=7, 3 enrollments, today's goal 3/4`);
  }

  // eslint-disable-next-line no-console
  console.log(`[seed:dashboard] upserted ${CATEGORIES.length} categories and ${COURSES.length} courses`);
  await mongoose.disconnect();
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error("[seed:dashboard] failed", err);
  process.exit(1);
});
