// models/Quiz.js
const mongoose = require("mongoose");

const quizSchema = new mongoose.Schema(
  {
    title: { type: String, required: true },
    teacherId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },

    groups: [{ type: mongoose.Schema.Types.ObjectId, ref: "Group" }], // can assign to many groups

    duration: { type: Number, required: true }, // in minutes

    questions: [
      { type: mongoose.Schema.Types.ObjectId, ref: "Question" }
    ],

    startTime: { type: Date }, // optional
    endTime: { type: Date },   // optional
  },
  { timestamps: true }
);

module.exports = mongoose.model("Quiz", quizSchema);

