const mongoose = require("mongoose");

const chapterSchema = new mongoose.Schema({
  name: { type: String, required: true },
  unitId: { type: mongoose.Schema.Types.ObjectId, ref: "Unit", required: true }
}, { timestamps: true });

module.exports = mongoose.model("Chapter", chapterSchema);
