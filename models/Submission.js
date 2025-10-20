const mongoose = require("mongoose");

const submissionSchema = new mongoose.Schema({
  taskId: { type: mongoose.Schema.Types.ObjectId, ref: "Task", required: true },
  studentId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  fileUrl: { type: String, required: false, default:null },  // path to uploaded PDF
  submittedAt: { type: Date, default: Date.now },
  grade: { type: Number },                   // ✅ teacher-assigned grade
  comments: { type: String },                // ✅ teacher feedback
  correctedFileUrl: { type: String },        // ✅ teacher re-upload
  gradedAt: { type: Date }   
});

module.exports = mongoose.model("Submission", submissionSchema);
