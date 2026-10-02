// One-off dev seed: adds the "Game Development" category and a complete
// beginner "Roblox Game Development" course (modules -> lessons -> projects).
// Each lesson points at a real, public YouTube video chosen by its title to
// match that lesson's topic. Video durations weren't available when this was
// written, so `estimatedMinutes` are rough estimates, not measured lengths.
// Safe to re-run: upserts the category + course by slug, then clears this
// course's modules/lessons/projects and recreates them.
import mongoose from "mongoose";
import { connectDB } from "../config/db";
import { Category } from "../models/Category";
import { Course } from "../models/Course";
import { Module } from "../models/Module";
import { Lesson } from "../models/Lesson";
import { Project } from "../models/Project";

const COURSE_SLUG = "roblox-game-development";
const PREVIEW_VIDEO_ID = "vCpl5M_9mcQ"; // AlvinBlox: How To Make A Roblox Game - Beginner Tutorial

interface LessonSpec {
  title: string;
  videoId: string;
  description: string;
  minutes?: number;
}
interface ProjectSpec {
  title: string;
  description: string;
  objectives: string[];
  requirements: string[];
  features: string[];
  minutes: number;
}
interface ModuleSpec {
  title: string;
  description: string;
  lessons: LessonSpec[];
  project?: ProjectSpec;
}

const MODULES: ModuleSpec[] = [
  {
    title: "Welcome to Roblox & Roblox Studio",
    description: "Meet Roblox, install Roblox Studio (the free tool you build games in) and start your first project.",
    lessons: [
      {
        title: "What Are Roblox and Roblox Studio?",
        videoId: "x2rgbNQ4ooM",
        description: "Roblox is the platform players use; Roblox Studio is the free program creators use to build games. Get the big picture and a first tour.",
      },
      {
        title: "Installing Roblox Studio",
        videoId: "ASPeFfcTaE4",
        description: "Create your account, download Roblox Studio and sign in.",
      },
      {
        title: "Setting Up Roblox Studio",
        videoId: "Cu88ayK6Kvg",
        description: "Set up the editor the way you want before you start building.",
      },
      {
        title: "Creating Your First Project",
        videoId: "IJFjBH_PfXQ",
        description: "Pick a template, open a new place and learn the basics of moving around in Studio.",
      },
    ],
  },
  {
    title: "Understanding the Studio Interface",
    description: "Learn what every window does so you never feel lost in Studio.",
    lessons: [
      {
        title: "A Full Tour of the Studio Interface",
        videoId: "p005iduooyw",
        description: "The viewport, ribbon, and panels explained for complete beginners.",
      },
      {
        title: "The Explorer and Properties Panels",
        videoId: "YenSXiC8MY4",
        description: "Explorer lists every object in your game. Properties lets you change how a selected object looks and behaves.",
      },
      {
        title: "Using the Toolbox",
        videoId: "apu3vXwe1fQ",
        description: "Find free models and items to add to your game, and learn to stay safe when using them.",
      },
      {
        title: "Studio Tutorial: Options and Basic Tools",
        videoId: "rfCoQsK-jcI",
        description: "A second walkthrough of Studio's options so the interface becomes second nature.",
      },
    ],
  },
  {
    title: "Parts, Models & Objects",
    description: "Everything in Roblox is built from objects. Learn to create and shape them.",
    lessons: [
      {
        title: "What Are Parts? Creating and Editing Parts",
        videoId: "M6bTcjbgxas",
        description: "A Part is the basic building block (a brick, ball, wedge...). Learn to insert and edit parts.",
      },
      {
        title: "Moving, Scaling and Rotating Parts",
        videoId: "vR1kyr8BqX8",
        description: "Use the Move, Scale and Rotate tools from the toolbar.",
      },
      {
        title: "Select, Move, Scale and Rotate Tools in Practice",
        videoId: "5qncHk8HSBM",
        description: "More practice with the four core tools, plus snapping.",
      },
      {
        title: "Anchoring Parts and Models",
        videoId: "0vTkQgnr0ys",
        description: "Anchored parts don't fall or move. Learn when and why to anchor.",
      },
      {
        title: "Grouping Parts into Models",
        videoId: "AqbwjzzRdaA",
        description: "A Model is a group of parts treated as one object. Keep your Explorer tidy.",
      },
      {
        title: "Unions: Combining Shapes",
        videoId: "KDdKM0VuSew",
        description: "Join and cut shapes to make custom pieces.",
      },
    ],
    project: {
      title: "Mini Build: A Small Obstacle Platform",
      description: "Use only what you've learned so far to build a small floating platform with stairs and a few obstacles.",
      objectives: ["Create, move, scale and rotate parts", "Anchor parts so they stay in place", "Group parts into a named Model"],
      requirements: [
        "At least 10 parts placed in your world",
        "All parts anchored",
        "Parts grouped into at least one named Model",
        "Parts use different colors and materials",
      ],
      features: ["Platform with stairs", "At least 3 obstacles", "Organised Explorer"],
      minutes: 45,
    },
  },
  {
    title: "Building & Environment Design",
    description: "Turn loose parts into a world: terrain, lighting and a place for players to start.",
    lessons: [
      {
        title: "Intro to World Building",
        videoId: "SgPU84AqpkY",
        description: "How parts, materials, terrain and lighting work together.",
      },
      {
        title: "Building Basics for Beginners",
        videoId: "uUiB_YkWZLQ",
        description: "Simple building techniques you can use right away.",
      },
      {
        title: "Beginner Guide to Terrain",
        videoId: "HYZr6R0ePLI",
        description: "Sculpt hills, water and ground with the Terrain Editor.",
      },
      {
        title: "Lighting Your World",
        videoId: "Xkj6zKI4VFI",
        description: "Change the time of day, shadows and mood.",
      },
      {
        title: "Spawn Locations (Starting Points)",
        videoId: "2c8-7ZqcCWY",
        description: "A spawn location is where players appear. Place and customise one.",
      },
    ],
  },
  {
    title: "Your First Scripts (Luau Basics)",
    description: "Luau is the coding language Roblox uses. No experience needed: start with printing and variables.",
    lessons: [
      {
        title: "Studio Basics for Scripters",
        videoId: "9MUgLaF22Yo",
        description: "The windows you'll use most when writing code, and where scripts live.",
      },
      {
        title: "Your First Script: Printing",
        videoId: "ei2Pc4xV1cQ",
        description: "Make the computer say 'Hello world' and see it in the Output window.",
      },
      {
        title: "Scripts vs LocalScripts",
        videoId: "lghSaBRkNc4",
        description: "A first, simple look at the two kinds of script and when each is used.",
      },
      {
        title: "Variables",
        videoId: "Irtrmwc_L30",
        description: "A variable is a labelled box that stores a value so you can use it later.",
      },
      {
        title: "Data Types: Numbers, Strings, Booleans",
        videoId: "iNEuKERoHcI",
        description: "Numbers, text (strings), true/false (booleans) and nil (nothing).",
      },
    ],
  },
  {
    title: "Programming Logic: Functions, Conditions & Loops",
    description: "The three ideas behind almost every script: reusable code, decisions and repetition.",
    lessons: [
      {
        title: "Functions",
        videoId: "f7aFVY5lCW4",
        description: "A function is a named set of instructions you can run whenever you like.",
      },
      {
        title: "If Statements (Conditionals)",
        videoId: "qh7lyBRma6Q",
        description: "Run code only when something is true: if this, then that.",
      },
      {
        title: "Else and Elseif",
        videoId: "6-Q6fnRugiQ",
        description: "Handle more than one possibility with elseif and else.",
      },
      {
        title: "Loops: while, for and repeat",
        videoId: "IMwKfWLgdR0",
        description: "Repeat code automatically instead of copying and pasting it.",
      },
      {
        title: "Tables (Lists of Things)",
        videoId: "dgMyNmrWCDc",
        description: "Store many values together, then loop over them.",
      },
    ],
  },
  {
    title: "Events & Controlling Objects with Scripts",
    description: "Make your world react: scripts that change objects and respond to touches.",
    lessons: [
      {
        title: "Changing Properties with Scripts",
        videoId: "HpvxTd1-_7g",
        description: "Change a part's color, transparency or size from code.",
      },
      {
        title: "Scripting Part Colors",
        videoId: "WgcHKpzPn3o",
        description: "BrickColor vs Color3, and building a color-changing part.",
      },
      {
        title: "Events Explained",
        videoId: "Cyjus9EQf48",
        description: "An event is a signal ('something happened') that your code can listen for.",
      },
      {
        title: "The Touched Event",
        videoId: "1L6DYGU3STM",
        description: "Run code when something touches a part: the start of most interactive objects.",
      },
    ],
    project: {
      title: "Interactive Objects Challenge",
      description: "Create three parts that react to players: one that changes color when touched, one that disappears, and one that changes size.",
      objectives: ["Use the Touched event", "Change part properties in code", "Use variables, functions and if statements together"],
      requirements: [
        "A part that changes color when touched",
        "A part that becomes transparent and non-collidable when touched",
        "A part that only reacts once (use a debounce variable)",
        "Messages printed to the Output window",
      ],
      features: ["3 working interactive parts", "Clean, commented scripts"],
      minutes: 60,
    },
  },
  {
    title: "Players, Characters & Tools",
    description: "Understand who is playing and give them items to use.",
    lessons: [
      {
        title: "Player vs Character",
        videoId: "HHtXhjOpKK0",
        description: "The Player is the person; the Character is the avatar in the world.",
      },
      {
        title: "The Humanoid and Its Properties",
        videoId: "aNL_GyidxLA",
        description: "Health, WalkSpeed and JumpPower all live on the Humanoid.",
      },
      {
        title: "Checking That a Player Touched a Part",
        videoId: "KGX8LYgZ2og",
        description: "Safely detect whether the thing touching a part is a player.",
      },
      {
        title: "StarterPlayer, StarterPlayerScripts and StarterCharacterScripts",
        videoId: "wg9ttGfhcYU",
        description: "Where to put scripts that run for every player.",
      },
      {
        title: "Creating a Tool",
        videoId: "CmaN6JxpDfs",
        description: "Tools are items players can hold, such as swords or flashlights.",
      },
      {
        title: "Making a Working Sword",
        videoId: "PgmwpX0LlNA",
        description: "Put tools and scripting together to make a sword that deals damage.",
      },
    ],
  },
  {
    title: "UI & GUI Development",
    description: "Screens, labels and buttons: how your game talks to players.",
    lessons: [
      {
        title: "Beginner's Guide to Roblox GUI",
        videoId: "lmNWskz9cEI",
        description: "ScreenGui, Frames and the difference between Scale and Offset.",
      },
      {
        title: "TextLabels",
        videoId: "VQH9h4zPNc4",
        description: "Show text on screen, such as a score or a message.",
      },
      {
        title: "Clickable Buttons",
        videoId: "dqJ7ZxBnmHY",
        description: "Make a button do something when it is clicked.",
      },
      {
        title: "Open and Close Menus",
        videoId: "y6s76jE8eYg",
        description: "Build a menu that opens and closes with a button.",
      },
    ],
  },
  {
    title: "Core Game Systems",
    description: "Build the pieces most games share: score, collectibles, damage, checkpoints and rounds.",
    lessons: [
      {
        title: "Leaderstats: Score and Leaderboards",
        videoId: "0fTFbyuB51E",
        description: "Create the in-game leaderboard that shows each player's stats.",
      },
      {
        title: "Coins and Collectibles",
        videoId: "ufJT3RyyabQ",
        description: "Collect coins that add to the player's score.",
      },
      {
        title: "Coin Collection with Animation",
        videoId: "Xijsk4NfBSc",
        description: "Make your coins spin and feel great to collect.",
      },
      {
        title: "Damage Bricks and Healing Pads",
        videoId: "Ve8FCbAUxNg",
        description: "Health and damage systems using the Humanoid.",
      },
      {
        title: "The Died Event: Reacting to Player Death",
        videoId: "lySqLEa12-k",
        description: "Run code when a player's character dies.",
      },
      {
        title: "Checkpoints",
        videoId: "Aa83VYif6VA",
        description: "Let players respawn at the last stage they reached.",
      },
      {
        title: "Spawn Points and Teams",
        videoId: "KUcj2a8tBHU",
        description: "Control where players appear.",
      },
      {
        title: "Game Rounds and Intermission",
        videoId: "mASPsQ9Mp-0",
        description: "A loop of waiting, playing and ending the round: the core of many games.",
      },
    ],
    project: {
      title: "Coin Collector Game",
      description: "Combine score, coins and damage into one small playable level.",
      objectives: ["Use leaderstats for score", "Make collectible coins", "Add a damage hazard and checkpoint"],
      requirements: [
        "Leaderboard showing Coins",
        "At least 10 collectible coins that disappear when collected",
        "A damage or kill brick",
        "At least one checkpoint",
      ],
      features: ["Working score system", "Hazard and checkpoint", "Playable start-to-finish"],
      minutes: 90,
    },
  },
  {
    title: "Multiplayer & Saving Player Data",
    description: "Roblox games are multiplayer by default. Learn how the pieces talk and how to save progress.",
    lessons: [
      {
        title: "Client vs Server in Roblox",
        videoId: "MhxTQDGRHh4",
        description: "Why some code runs on the server and some on each player's device.",
      },
      {
        title: "Testing with Multiple Players",
        videoId: "6JyrGxWpe6M",
        description: "Test your game with several players at once, right inside Studio.",
      },
      {
        title: "RemoteEvents (Beginner Friendly)",
        videoId: "QyP7XxV4A-8",
        description: "Let the client and server send messages to each other safely.",
      },
      {
        title: "DataStore Basics: Saving Player Data",
        videoId: "twXk5B5G5dA",
        description: "A DataStore is Roblox's cloud save. Save and load a value.",
      },
      {
        title: "Saving Data the Right Way",
        videoId: "YMvezOFyl8o",
        description: "Use pcall and autosave so players never lose progress.",
      },
      {
        title: "Saving Leaderstats",
        videoId: "z7yTYcE1gcI",
        description: "Make your leaderboard values persist between visits.",
      },
    ],
  },
  {
    title: "Testing, Publishing & Improving",
    description: "Find bugs, share your game with the world, earn from it and make it run smoothly.",
    lessons: [
      {
        title: "Debugging with the Output Window",
        videoId: "Uh7rFR-kb2k",
        description: "Read error messages and use print to find bugs.",
      },
      {
        title: "Using the Studio Debugger",
        videoId: "yOmPc2g8tbY",
        description: "Pause your code with breakpoints and step through it.",
      },
      {
        title: "Publishing Your Game",
        videoId: "7vBzNdo-Zcw",
        description: "Publish to Roblox and set the game's name, icon and access.",
      },
      {
        title: "Game Passes",
        videoId: "WT_FGN4usok",
        description: "One-time purchases players can buy in your game.",
      },
      {
        title: "Developer Products",
        videoId: "a4qYdUHxpMQ",
        description: "Items players can buy repeatedly, such as coins or boosts.",
      },
      {
        title: "Optimizing Your Game",
        videoId: "VDO_amtWfDw",
        description: "Keep your game fast on every device.",
      },
    ],
  },
  {
    title: "Final Project: Build a Complete Obby",
    description: "Put everything together and ship a full, playable obstacle-course game.",
    lessons: [
      {
        title: "Final Project Overview: What an Obby Needs",
        videoId: "4qMWI8UyVjg",
        description: "Plan your obby: stages, obstacles, checkpoints and a finish line.",
      },
      {
        title: "Building the Stages Step by Step",
        videoId: "q1bQpiSmKMg",
        description: "Build obstacles and a stage system.",
      },
      {
        title: "Obby Checkpoints with Saving",
        videoId: "ibpdHIFV_XE",
        description: "Add checkpoints that remember how far a player got.",
      },
      {
        title: "Finishing Touches and Launch",
        videoId: "f8z4IKtY5Rc",
        description: "Polish, test with friends and publish your finished game.",
      },
    ],
    project: {
      title: "Final Project: Your Complete Roblox Obby",
      description:
        "Build and publish a complete obstacle-course game that uses what you learned: building, scripting, UI, score, health, checkpoints, saving data and publishing.",
      objectives: [
        "Design and build a multi-stage level",
        "Script hazards, collectibles and checkpoints",
        "Add a GUI and a saving leaderboard",
        "Test, publish and share your game",
      ],
      requirements: [
        "At least 10 stages with increasing difficulty",
        "Checkpoints that save the player's stage",
        "A leaderboard that saves with a DataStore",
        "A GUI showing stage or coins",
        "At least one kill brick and one collectible",
        "Game published to Roblox with a name and description",
      ],
      features: ["Playable start-to-finish", "Saved progress", "Published and shareable"],
      minutes: 240,
    },
  },
];

async function main() {
  await connectDB();

  const lastCategory = await Category.findOne().sort({ order: -1 });
  const category = await Category.findOneAndUpdate(
    { slug: "game-development" },
    {
      $set: { name: "Game Development", icon: "game-controller", colorToken: "orange" },
      $setOnInsert: { order: (lastCategory?.order ?? 0) + 1 },
    },
    { upsert: true, new: true }
  );

  const course = await Course.findOneAndUpdate(
    { slug: COURSE_SLUG },
    {
      $set: {
        title: "Roblox Game Development for Beginners",
        description:
          "Never used Roblox Studio or written code? Start here. Learn Roblox Studio, build worlds, learn Luau scripting from scratch, add scores, health, checkpoints and menus, save player data, publish your game and finish by building a complete obby.",
        category: category._id,
        difficulty: "beginner",
        previewVideoId: PREVIEW_VIDEO_ID,
        language: "English",
        tags: ["Roblox", "Luau", "Game Development"],
        skillsLearned: [
          "Build worlds in Roblox Studio",
          "Write Luau scripts: variables, functions, conditions, loops and events",
          "Create UI, score, health and checkpoint systems",
          "Save player data with DataStores",
          "Publish and monetize your game",
        ],
        requirements: ["A computer that can run Roblox Studio (Windows or Mac)", "A free Roblox account", "No coding experience needed"],
        isPublished: true,
      },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  const existingModules = await Module.find({ course: course._id });
  await Lesson.deleteMany({ course: course._id });
  await Project.deleteMany({ course: course._id });
  await Module.deleteMany({ _id: { $in: existingModules.map((m) => m._id) } });

  let lessonCount = 0;
  let projectCount = 0;
  let totalMinutes = 0;

  for (const [moduleIndex, spec] of MODULES.entries()) {
    // eslint-disable-next-line no-await-in-loop
    const mod = await Module.create({
      course: course._id,
      title: spec.title,
      description: spec.description,
      order: moduleIndex,
      isPublished: true,
    });

    for (const [lessonIndex, lesson] of spec.lessons.entries()) {
      const minutes = lesson.minutes ?? 12;
      totalMinutes += minutes;
      // eslint-disable-next-line no-await-in-loop
      await Lesson.create({
        module: mod._id,
        course: course._id,
        title: lesson.title,
        description: lesson.description,
        videoProvider: "youtube",
        videoId: lesson.videoId,
        video: {
          type: "youtube",
          youtube: { videoId: lesson.videoId, url: `https://www.youtube.com/watch?v=${lesson.videoId}` },
        },
        estimatedMinutes: minutes,
        order: lessonIndex,
        isPublished: true,
      });
      lessonCount += 1;
    }

    if (spec.project) {
      // eslint-disable-next-line no-await-in-loop
      await Project.create({
        module: mod._id,
        course: course._id,
        title: spec.project.title,
        description: spec.project.description,
        learningObjectives: spec.project.objectives,
        requirements: spec.project.requirements.map((label, i) => ({ key: `req${i + 1}`, label })),
        requiredTechnologies: ["Roblox Studio", "Luau"],
        difficulty: "beginner",
        estimatedMinutes: spec.project.minutes,
        expectedFeatures: spec.project.features,
        submissionMethods: ["url", "screenshots"],
        githubRequired: false,
        demoUrlRequired: false,
      });
      projectCount += 1;
    }
  }

  course.moduleCount = MODULES.length;
  course.lessonCount = lessonCount;
  course.projectCount = projectCount;
  course.durationMinutes = totalMinutes;
  await course.save();

  // eslint-disable-next-line no-console
  console.log(`[seed] ${COURSE_SLUG}: ${MODULES.length} modules, ${lessonCount} lessons, ${projectCount} project(s)`);
  await mongoose.disconnect();
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error("[seed] failed", err);
  process.exit(1);
});
