const mongoose = require("mongoose");

const quizSubmissionSchema = new mongoose.Schema({
  quizId: { type: mongoose.Schema.Types.ObjectId, ref: "Quiz", required: true },
  studentId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  answers: [
    {
      questionId: { type: mongoose.Schema.Types.ObjectId, ref: "Question" },
      answer: String,
      isCorrect: Boolean,
    },
  ],
  score: { type: Number, required: true },
  submittedAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model("QuizSubmission", quizSubmissionSchema);
