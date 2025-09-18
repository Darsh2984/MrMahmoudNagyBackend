const mongoose = require("mongoose");

const materialSchema = new mongoose.Schema(
  {
    title: { type: String, required: true },
    fileUrl: { type: String, required: true },
    yearId: { type: mongoose.Schema.Types.ObjectId, ref: "Year", required: true },
    unitId: { type: mongoose.Schema.Types.ObjectId, ref: "Unit", required: true },
    chapterId: { type: mongoose.Schema.Types.ObjectId, ref: "Chapter", required: true },
    teacherId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Material", materialSchema);
