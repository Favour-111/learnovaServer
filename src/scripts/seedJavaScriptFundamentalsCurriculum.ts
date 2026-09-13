// One-off dev seed: the "JavaScript Fundamentals" course exists in the DB
// (title/stats/rating) but had zero real Module/Lesson/Project documents —
// its moduleCount/lessonCount/projectCount were just numbers typed in by
// hand, disconnected from any real structure. This seeds the real thing so
// the course detail page's "Course content" accordion has genuine,
// navigable data instead of an empty list contradicting its own stats.
// Safe to re-run: clears this course's existing modules/lessons/project
// first, then recreates them.
import mongoose from "mongoose";
import { connectDB } from "../config/db";
import { Course } from "../models/Course";
import { Module } from "../models/Module";
import { Lesson } from "../models/Lesson";
import { Project } from "../models/Project";

// A single real, freely embeddable YouTube video (freeCodeCamp's full JS
// course) used both as the course preview/trailer and as the placeholder
// video for every lesson — good enough for a working demo without needing
// 28 individually-curated videos.
const VIDEO_ID = "PkZNo7MFNFg";
const PDF_URL = "https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf";

const MODULES: { title: string; lessons: { title: string; minutes: number }[] }[] = [
  {
    title: "Getting Started",
    lessons: [
      { title: "Introduction to JavaScript", minutes: 8.75 },
      { title: "Setting Up Your Environment", minutes: 6.2 },
      { title: "Writing Your First Script", minutes: 7.5 },
      { title: "Comments & Best Practices", minutes: 5.33 },
    ],
  },
  {
    title: "Variables & Data Types",
    lessons: [
      { title: "Declaring Variables (let, const, var)", minutes: 9 },
      { title: "Primitive Data Types", minutes: 10.5 },
      { title: "Type Conversion & Coercion", minutes: 11 },
      { title: "Template Literals", minutes: 6.5 },
      { title: "Variable Scope Basics", minutes: 9.5 },
    ],
  },
  {
    title: "Operators & Expressions",
    lessons: [
      { title: "Arithmetic Operators", minutes: 7 },
      { title: "Comparison & Logical Operators", minutes: 10 },
      { title: "Assignment Operators", minutes: 6 },
      { title: "Operator Precedence", minutes: 8 },
    ],
  },
  {
    title: "Functions",
    lessons: [
      { title: "Declaring Functions", minutes: 9 },
      { title: "Function Parameters & Arguments", minutes: 10 },
      { title: "Return Values", minutes: 7.5 },
      { title: "Arrow Functions", minutes: 11 },
      { title: "Default Parameters", minutes: 6.5 },
      { title: "Functions as Values", minutes: 12 },
    ],
  },
  {
    title: "Arrays & Objects",
    lessons: [
      { title: "Creating & Accessing Arrays", minutes: 9.5 },
      { title: "Array Methods (map, filter, reduce)", minutes: 14 },
      { title: "Creating Objects", minutes: 8.5 },
      { title: "Object Properties & Methods", minutes: 10 },
      { title: "Nested Data Structures", minutes: 12.5 },
    ],
  },
  {
    title: "Mini Projects & Wrap-up",
    lessons: [
      { title: "Planning Your Mini Project", minutes: 6 },
      { title: "Building the Project — Part 1", minutes: 15 },
      { title: "Building the Project — Part 2", minutes: 15 },
      { title: "Debugging & Polishing", minutes: 9 },
    ],
  },
];

async function main() {
  await connectDB();

  const course = await Course.findOne({ slug: "javascript-fundamentals" });
  if (!course) throw new Error("javascript-fundamentals course not found — run the base seed first");

  course.previewVideoId = VIDEO_ID;
  course.pdfUrl = PDF_URL;
  course.language = "English";
  course.tags = ["JavaScript"];
  course.skillsLearned = [
    "Understand variables, data types & operators",
    "Manipulate arrays & objects",
    "Work with functions & scope",
    "Build mini projects with JS",
  ];

  const existingModules = await Module.find({ course: course._id });
  const existingModuleIds = existingModules.map((m) => m._id);
  await Lesson.deleteMany({ course: course._id });
  await Project.deleteMany({ course: course._id });
  await Module.deleteMany({ _id: { $in: existingModuleIds } });

  let lessonCount = 0;
  let lastModuleId: mongoose.Types.ObjectId | null = null;

  for (const [moduleIndex, moduleSpec] of MODULES.entries()) {
    // eslint-disable-next-line no-await-in-loop
    const mod = await Module.create({
      course: course._id,
      title: moduleSpec.title,
      order: moduleIndex,
      isPublished: true,
    });
    lastModuleId = mod._id;

    for (const [lessonIndex, lessonSpec] of moduleSpec.lessons.entries()) {
      // eslint-disable-next-line no-await-in-loop
      await Lesson.create({
        module: mod._id,
        course: course._id,
        title: lessonSpec.title,
        videoProvider: "youtube",
        videoId: VIDEO_ID,
        estimatedMinutes: Math.round(lessonSpec.minutes),
        order: lessonIndex,
        isPublished: true,
      });
      lessonCount += 1;
    }
  }

  await Project.create({
    module: lastModuleId,
    course: course._id,
    title: "To-Do List App",
    description:
      "Build a small vanilla-JS to-do list app: add tasks, mark them complete, delete them, and persist the list across page reloads using localStorage.",
    requirements: [
      "Add new tasks via a text input",
      "Mark tasks as complete",
      "Delete tasks",
      "Persist tasks using localStorage",
    ],
    technologies: ["JavaScript", "HTML", "CSS"],
    difficulty: "beginner",
    expectedFeatures: [
      "Add-task input and button",
      "Rendered task list",
      "Complete/delete actions per task",
      "Data persists after a page reload",
    ],
  });

  course.moduleCount = MODULES.length;
  course.lessonCount = lessonCount;
  course.projectCount = 1;
  await course.save();

  // eslint-disable-next-line no-console
  console.log(`[seed] javascript-fundamentals: ${MODULES.length} modules, ${lessonCount} lessons, 1 project`);
  await mongoose.disconnect();
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error("[seed] failed", err);
  process.exit(1);
});
