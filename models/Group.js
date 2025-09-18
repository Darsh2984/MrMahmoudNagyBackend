const mongoose = require("mongoose");

const groupSchema = new mongoose.Schema({
  name: { type: String, required: true },
  yearId: { type: mongoose.Schema.Types.ObjectId, ref: "Year", required: true },
  students: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }]
});

module.exports = mongoose.model("Group", groupSchema);
