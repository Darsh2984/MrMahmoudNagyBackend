const mongoose = require("mongoose");

const unitSchema = new mongoose.Schema({
  name: { type: String, required: true },
  chapters: [{ type: mongoose.Schema.Types.ObjectId, ref: "Chapter" }],
  yearId: { type: mongoose.Schema.Types.ObjectId, ref: "Year", required: true },
  teacherId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true }
}, { timestamps: true });

module.exports = mongoose.model("Unit", unitSchema);
