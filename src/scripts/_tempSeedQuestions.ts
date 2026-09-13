import mongoose from "mongoose";
import { connectDB } from "../config/db";
import { Question } from "../models/Question";

const QUIZ_ID = "6a9982dc39fdda87a6358b2d";

(async () => {
  await connectDB();
  await Question.deleteMany({ quiz: QUIZ_ID });
  await Question.insertMany([
    {
      quiz: QUIZ_ID,
      type: "multiple_choice",
      prompt: "Which HTML tag is used to create a hyperlink?",
      options: ["<link>", "<href>", "<a>", "<hyperlink>"],
      correctOptionIndex: 2,
      explanation: "The <a> (anchor) tag defines a hyperlink.",
      order: 0,
    },
    {
      quiz: QUIZ_ID,
      type: "true_false",
      prompt: "CSS stands for Cascading Style Sheets.",
      options: [],
      correctBoolean: true,
      explanation: "Correct — CSS is used to style HTML elements.",
      order: 1,
    },
    {
      quiz: QUIZ_ID,
      type: "multiple_choice",
      prompt: "Which tag is used for the largest heading?",
      options: ["<h6>", "<heading>", "<h1>", "<head>"],
      correctOptionIndex: 2,
      explanation: "<h1> defines the most important heading.",
      order: 2,
    },
  ]);
  console.log("seeded temp questions");
  await mongoose.disconnect();
})();
