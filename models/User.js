const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true, lowercase: true },
    password: { type: String }, // optional (for social login/future use)
    role: { type: String, enum: ["teacher", "student", "parent"], required: true },

    // 🔹 Student extras
    studentPhone: String,
    parentName: String,
    parentPhone: String,
    parentId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    groupId: { type: mongoose.Schema.Types.ObjectId, ref: "Group", default: null },
    yearId: { type: mongoose.Schema.Types.ObjectId, ref: "Year", default: null },

    // 🔹 Parent extras
    children: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],

    // 🔹 Activation
    needsActivation: { type: Boolean, default: false },

    // 🔹 Forgot Password fields
    resetPasswordToken: { type: String, default: null },
    resetPasswordExpires: { type: Date, default: null },
  },
  { timestamps: true }
);

// 🔹 Hash password only if modified
userSchema.pre("save", async function (next) {
  if (!this.isModified("password") || !this.password) return next();
  this.password = await bcrypt.hash(this.password, 10);
  next();
});

module.exports = mongoose.model("User", userSchema);
