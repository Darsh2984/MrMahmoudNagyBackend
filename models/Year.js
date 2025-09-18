const mongoose = require("mongoose");

const yearSchema = new mongoose.Schema({
  name: { type: String, required: true },
  teacherId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  groups: [{ type: mongoose.Schema.Types.ObjectId, ref: "Group" }]
});

module.exports = mongoose.model("Year", yearSchema);
