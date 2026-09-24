import { Response } from "express";
import { Course } from "../models/Course";
import { Module } from "../models/Module";
import { Lesson } from "../models/Lesson";
import { Project } from "../models/Project";
import { ProjectAttempt } from "../models/ProjectAttempt";
import { Enrollment } from "../models/Enrollment";
import { LessonProgress } from "../models/LessonProgress";
import { CreditTransaction } from "../models/CreditTransaction";
import { AuthedRequest } from "../middleware/auth";
import { emitUserUpdate } from "../services/realtime";
import { getOrSetCache } from "../services/cache";

// Trimmed from list responses  large, detail-only content that no list
// card reads (course/[id].tsx's material reader is the only consumer of
// materialContent; pdfUrl is a legacy fallback for the same reader). Kept
// on the single-course endpoint (getCourse) where it's actually used.
const LIST_EXCLUDED_FIELDS = "-materialContent -pdfUrl";

const DEFAULT_PAGE_SIZE = 20;
const MAX_PAGE_SIZE = 50;

// listCourses is Home's carousels + the Courses tab's main list  almost
// certainly the highest-traffic read in the whole app, and identical for
// every signed-out/no-saved-courses caller hitting the same filter
// combination, so it's the clearest "featured/popular courses" caching
// target. Short TTL rather than explicit invalidation on every course
// write: a newly-published course or edited title showing up up to 2
// minutes late is an acceptable tradeoff for a course catalog (nothing
// time-sensitive, unlike a quiz result or payment), and avoids having to
// enumerate every possible filter-combination cache key to invalidate.
const COURSE_LIST_CACHE_TTL_SECONDS = 120;

// GET /api/courses?tab=all|popular|new|free|premium&category=&search=&page=&limit=
// `page`/`limit` are optional  omitting them preserves the old "give me
// up to 50" behavior for callers that just want a small bounded set (Home's
// carousels, the categories-derivation fetch on the Courses tab) without
// forcing every call site to become pagination-aware. The Courses tab's
// main list is the one that actually opts into paging (see useCoursesInfinite).
export async function listCourses(req: AuthedRequest, res: Response) {
  const { tab, category, search, page, limit } = req.query as Record<string, string | undefined>;
  const filter: Record<string, unknown> = { isPublished: true };

  if (category) filter.category = category;
  if (tab === "free") filter.isPremium = false;
  if (tab === "premium") filter.isPremium = true;
  if (search) filter.title = { $regex: search, $options: "i" };

  const pageSize = Math.min(Math.max(Number(limit) || DEFAULT_PAGE_SIZE, 1), MAX_PAGE_SIZE);
  const pageNumber = Math.max(Number(page) || 1, 1);
  const isPaginated = page != null || limit != null;

  // Cached WITHOUT any per-user data  isSaved is layered on after, below,
  // from req.dbUser, so the same cache entry is safely shared across every
  // caller hitting this exact filter/page combination regardless of who's
  // signed in.
  const cacheKey = `courses:list:${tab ?? ""}:${category ?? ""}:${search ?? ""}:${pageNumber}:${pageSize}:${isPaginated}`;
  const { courses, total } = await getOrSetCache(cacheKey, COURSE_LIST_CACHE_TTL_SECONDS, async () => {
    let query = Course.find(filter, LIST_EXCLUDED_FIELDS).populate("category").lean();
    if (tab === "popular") query = query.sort({ studentCount: -1 });
    if (tab === "new") query = query.sort({ createdAt: -1 });

    const [courses, total] = await Promise.all([
      isPaginated ? query.skip((pageNumber - 1) * pageSize).limit(pageSize) : query.limit(50),
      isPaginated ? Course.countDocuments(filter) : Promise.resolve(undefined),
    ]);
    return { courses, total };
  });

  // Signed-out browsing (or a session with nothing saved yet) just skips
  // this  the bookmark icon on the client defaults to the outline state.
  const savedIds = req.dbUser?.savedCourses;
  const coursesJson = savedIds
    ? courses.map((c) => ({ ...c, isSaved: savedIds.some((id) => id.equals(c._id)) }))
    : courses;

  res.json({
    courses: coursesJson,
    ...(isPaginated ? { page: pageNumber, limit: pageSize, total, hasMore: pageNumber * pageSize < (total ?? 0) } : {}),
  });
}

// GET /api/courses/saved  the learner's bookmarked courses, for the
// Favorites screen. Separate from listCourses' isSaved flag (which just
// marks courses already being browsed) since this is the one place a saved
// course with no other traffic (not enrolled, not in "popular") still needs
// to be reachable.
export async function listSavedCourses(req: AuthedRequest, res: Response) {
  if (!req.dbUser) return res.status(401).json({ error: "Unauthorized" });
  const courses = await Course.find({ _id: { $in: req.dbUser.savedCourses } }).populate("category").lean();
  const coursesJson = courses.map((c) => ({ ...c, isSaved: true }));
  res.json({ courses: coursesJson });
}

// GET /api/courses/my?page=&limit=  courses the current user is enrolled
// in. page/limit are optional  omitting them returns the same
// {enrollments: [...]} shape as before, just now safety-capped at 100
// instead of genuinely unbounded.
export async function listMyCourses(req: AuthedRequest, res: Response) {
  if (!req.dbUser) return res.status(401).json({ error: "Unauthorized" });
  const { page, limit } = req.query as Record<string, string | undefined>;
  const pageSize = Math.min(Math.max(Number(limit) || 100, 1), 100);
  const pageNumber = Math.max(Number(page) || 1, 1);
  const isPaginated = page != null || limit != null;

  const query = Enrollment.find({ user: req.dbUser._id })
    .populate({
      path: "course",
      populate: { path: "category" },
    })
    .lean();

  const [enrollments, total] = await Promise.all([
    isPaginated ? query.skip((pageNumber - 1) * pageSize).limit(pageSize) : query.limit(pageSize),
    isPaginated ? Enrollment.countDocuments({ user: req.dbUser._id }) : Promise.resolve(undefined),
  ]);

  res.json({
    enrollments,
    ...(isPaginated ? { page: pageNumber, limit: pageSize, total, hasMore: pageNumber * pageSize < (total ?? 0) } : {}),
  });
}

// GET /api/courses/:id  full detail including module/lesson/project structure.
export async function getCourse(req: AuthedRequest, res: Response) {
  const course = await Course.findById(req.params.id).populate("category").lean();
  if (!course) return res.status(404).json({ error: "Course not found" });

  const modules = await Module.find({ course: course._id }).sort({ order: 1 }).lean();
  // isPublished: true here matters beyond just hiding drafts  it's what
  // keeps this endpoint's lesson set (and therefore its inline project-lock
  // calculation below) consistent with services/moduleAccess.ts's
  // isModuleComplete and lessonController.ts's recalculateCourseProgress,
  // both of which already scope to published lessons only. Without it, an
  // unpublished draft lesson would show up as uncompletable content in the
  // outline AND make a project look locked here while the project's own
  // screen (which uses isModuleComplete) correctly shows it unlocked.
  const [lessons, projects] = await Promise.all([
    Lesson.find({ course: course._id, isPublished: true }).sort({ order: 1 }).lean(),
    Project.find({ course: course._id }).lean(),
  ]);

  let completedLessonIds = new Set<string>();
  let passedProjectIds = new Set<string>();
  let enrollment = null;
  let isSaved = false;
  if (req.dbUser) {
    enrollment = await Enrollment.findOne({ user: req.dbUser._id, course: course._id }).lean();
    isSaved = req.dbUser.savedCourses.some((id) => id.equals(course._id));
    const progress = await LessonProgress.find({ user: req.dbUser._id, course: course._id, isCompleted: true }).lean();
    completedLessonIds = new Set(progress.map((p) => p.lesson.toString()));
    const passedProjectIdList = await ProjectAttempt.find({
      user: req.dbUser._id,
      project: { $in: projects.map((p) => p._id) },
      passed: true,
    }).distinct("project");
    passedProjectIds = new Set(passedProjectIdList.map((id) => id.toString()));
  }

  const structure = modules.map((mod) => {
    const moduleLessons = lessons.filter((l) => l.module.equals(mod._id));
    const project = projects.find((p) => p.module.equals(mod._id)) ?? null;
    // Locked until every lesson in this module is completed  mirrors
    // services/moduleAccess.ts (which submitProject actually enforces),
    // just computed inline here since the lesson/progress data is already
    // in hand for the whole course.
    const isProjectLocked = moduleLessons.length > 0 && !moduleLessons.every((l) => completedLessonIds.has(l._id.toString()));
    const isProjectPassed = project ? passedProjectIds.has(project._id.toString()) : false;

    return {
      module: mod,
      lessons: moduleLessons.map((l) => ({ ...l, isCompleted: completedLessonIds.has(l._id.toString()) })),
      project: project ? { _id: project._id, title: project.title, isLocked: isProjectLocked, isPassed: isProjectPassed } : null,
    };
  });

  // Module/lesson titles stay visible either way (matches the course
  // detail screen showing the outline before purchase)  only the actual
  // reading material is sensitive enough to strip server-side rather than
  // just hide behind a lock icon client-side. hasMaterial is sent either
  // way so the client can still render a locked "Course Material" card
  // without ever receiving the real content.
  const hasPurchased = !course.isPremium || !!enrollment?.isPaid;
  const hasMaterial = !!(course.materialContent || course.pdfUrl);
  const courseJson = course as unknown as Record<string, unknown>;
  if (!hasPurchased) {
    delete courseJson.materialContent;
    delete courseJson.pdfUrl;
  }
  courseJson.hasMaterial = hasMaterial;

  res.json({ course: courseJson, structure, enrollment, isSaved });
}

// PUT /api/courses/:id/save  toggles the course in the user's saved list
// (the bookmark button on the course detail screen).
export async function toggleSaveCourse(req: AuthedRequest, res: Response) {
  if (!req.dbUser) return res.status(401).json({ error: "Unauthorized" });
  const course = await Course.findById(req.params.id).select("_id").lean();
  if (!course) return res.status(404).json({ error: "Course not found" });

  const alreadySaved = req.dbUser.savedCourses.some((id) => id.equals(course._id));
  if (alreadySaved) {
    req.dbUser.savedCourses = req.dbUser.savedCourses.filter((id) => !id.equals(course._id));
  } else {
    req.dbUser.savedCourses.push(course._id);
  }
  await req.dbUser.save();

  res.json({ isSaved: !alreadySaved });
}

// POST /api/courses/:id/enroll  free courses only; a premium course must
// go through purchaseCourse instead, which is what actually flips isPaid.
export async function enrollInCourse(req: AuthedRequest, res: Response) {
  if (!req.dbUser) return res.status(401).json({ error: "Unauthorized" });
  const course = await Course.findById(req.params.id).select("isPremium priceCredits").lean();
  if (!course) return res.status(404).json({ error: "Course not found" });

  const existing = await Enrollment.findOne({ user: req.dbUser._id, course: course._id }).lean();
  if (existing) {
    return res.status(200).json({ enrollment: existing });
  }

  if (course.isPremium && course.priceCredits > 0) {
    return res.status(402).json({ error: "This is a premium course  purchase it with credits first.", priceCredits: course.priceCredits });
  }

  const enrollment = await Enrollment.create({
    user: req.dbUser._id,
    course: course._id,
    status: "active",
    isPaid: !course.isPremium,
    progressPercent: 0,
    enrolledAt: new Date(),
  });

  await Course.updateOne({ _id: course._id }, { $inc: { studentCount: 1 } });

  res.status(201).json({ enrollment });
}

// POST /api/courses/:id/purchase  spends credits to unlock a premium
// course. Creates the enrollment if one doesn't exist yet, or flips
// isPaid on an existing (free-preview) one.
export async function purchaseCourse(req: AuthedRequest, res: Response) {
  if (!req.dbUser) return res.status(401).json({ error: "Unauthorized" });
  const course = await Course.findById(req.params.id).select("isPremium priceCredits").lean();
  if (!course) return res.status(404).json({ error: "Course not found" });
  if (!course.isPremium || course.priceCredits <= 0) {
    return res.status(400).json({ error: "This course isn't premium" });
  }

  let enrollment = await Enrollment.findOne({ user: req.dbUser._id, course: course._id });
  if (enrollment?.isPaid) {
    return res.json({ enrollment, credits: req.dbUser.credits, alreadyPurchased: true });
  }

  const price = course.priceCredits;
  if (req.dbUser.credits < price) {
    return res.status(402).json({ error: "Not enough credits", required: price, balance: req.dbUser.credits });
  }

  req.dbUser.credits -= price;
  await req.dbUser.save();
  await CreditTransaction.create({
    user: req.dbUser._id,
    amount: -price,
    source: "spend_unlock",
    sourceRefId: course._id,
    balanceAfter: req.dbUser.credits,
  });

  if (enrollment) {
    enrollment.isPaid = true;
    await enrollment.save();
  } else {
    enrollment = await Enrollment.create({
      user: req.dbUser._id,
      course: course._id,
      status: "active",
      isPaid: true,
      progressPercent: 0,
      enrolledAt: new Date(),
    });
    await Course.updateOne({ _id: course._id }, { $inc: { studentCount: 1 } });
  }

  emitUserUpdate(String(req.dbUser._id), "course_purchase");
  res.json({ enrollment, credits: req.dbUser.credits });
}
