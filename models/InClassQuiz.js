const mongoose = require("mongoose");

const InClassQuizSchema = new mongoose.Schema({
  teacherId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  yearId: { type: mongoose.Schema.Types.ObjectId, ref: "Year", required: true },
  groupId: { type: mongoose.Schema.Types.ObjectId, ref: "Group", required: true },
  quizName: { type: String, required: true },
  date: { type: Date, required: true },
  gradeOutOf: { type: Number, required: true },
  studentGrades: [
    {
      studentId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
      grade: { type: Number, default: null },
    },
  ],
});

module.exports = mongoose.model("InClassQuiz", InClassQuizSchema);

