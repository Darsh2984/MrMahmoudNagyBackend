const mongoose = require("mongoose");

const videoCheckpointSchema = new mongoose.Schema(
  {
    videoId: { type: mongoose.Schema.Types.ObjectId, ref: "Video", required: true },
    timeInSeconds: { type: Number, required: true },
    questionIds: [
      { type: mongoose.Schema.Types.ObjectId, ref: "Question", required: true },
    ], // ✅ use references instead of embedded structure
  },
  { timestamps: true }
);

module.exports = mongoose.model("VideoCheckpoint", videoCheckpointSchema);