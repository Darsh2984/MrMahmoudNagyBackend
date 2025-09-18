// models/Video.js
const mongoose = require("mongoose");

const videoSchema = new mongoose.Schema({
  title: { type: String, required: true },
  videoUrl: { type: String, required: true }, // path to stored video
  yearId: { type: mongoose.Schema.Types.ObjectId, ref: "Year", required: true },
  unitId: { type: mongoose.Schema.Types.ObjectId, ref: "Unit", required: true },
  chapterId: { type: mongoose.Schema.Types.ObjectId, ref: "Chapter", required: true },
  teacherId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model("Video", videoSchema);
