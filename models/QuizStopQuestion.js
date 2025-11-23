const mongoose = require("mongoose");

const QuizStopQuestionSchema = new mongoose.Schema(
  {
    imageUrl: { type: String, required: true },
    correctAnswer: { type: String, required: true },

    yearId: { type: mongoose.Schema.Types.ObjectId, ref: "Year", required: true },
    unitId: { type: mongoose.Schema.Types.ObjectId, ref: "Unit", required: true },
    chapterId: { type: mongoose.Schema.Types.ObjectId, ref: "Chapter", required: true },

    teacherId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model("QuizStopQuestion", QuizStopQuestionSchema);
