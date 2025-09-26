const mongoose = require("mongoose");

const taskSchema = new mongoose.Schema({
  title: { type: String, required: true },
  description: { type: String },
  teacherId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  yearId: { type: mongoose.Schema.Types.ObjectId, ref: "Year", required: true },
  groups: [{ type: mongoose.Schema.Types.ObjectId, ref: "Group", required: true }], // ✅ array of groups
  deadline: { type: Date, required: true },
  gradeOutOf: { type: Number, required: true },
  notifiedDeadline: { type: Boolean, default: false },
  notifiedStudents: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
  notifiedParents: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],

}); 

module.exports = mongoose.model("Task", taskSchema);
