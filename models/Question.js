const mongoose = require("mongoose");

const questionSchema = new mongoose.Schema({
  imageUrl: { type: String, required: true }, // image with question + options
  correctAnswer: { type: String, required: true }, // "A" | "B" | "C" | "D"
  unitId: { type: mongoose.Schema.Types.ObjectId, ref: "Unit", required: true },
  chapterId: { type: mongoose.Schema.Types.ObjectId, ref: "Chapter", required: true },
  teacherId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true }
}, { timestamps: true });

module.exports = mongoose.model("Question", questionSchema);
