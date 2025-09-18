const mongoose = require("mongoose");

const sessionSchema = new mongoose.Schema({
  title: { type: String, required: true },
  date: { type: Date, default: Date.now },
  teacherId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  yearId: { type: mongoose.Schema.Types.ObjectId, ref: "Year", required: true },   // 👈 added
  groupId: { type: mongoose.Schema.Types.ObjectId, ref: "Group", required: true },
  attendance: [
    {
      studentId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
      status: { type: String, enum: ["Present", "Absent"], default: "Absent" }
    }
  ]
});

module.exports = mongoose.model("Session", sessionSchema);
