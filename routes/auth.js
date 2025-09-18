const express = require("express");
const router = express.Router();
const User = require("../models/User");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const Group = require("../models/Group"); 
const School = require("../models/School")
const transporter = require("../config/nodemailer");



// Register
router.post("/register", async (req, res) => {
  try {
    let { 
      name, 
      email, 
      password, 
      role, 
      studentPhone, 
      parentName, 
      parentPhone, 
      parentEmail,
      schoolId,
    } = req.body;

    // normalize email
    email = email.toLowerCase();

    // check if user exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ msg: "❌ User already exists" });
    }

    let parentAccount = null;

    // ✅ If registering a student → handle parent
    if (role === "student") {
      if (!parentEmail) {
        return res.status(400).json({ msg: "❌ Parent email is required for students" });
      }

      parentEmail = parentEmail.toLowerCase();

      parentAccount = await User.findOne({ email: parentEmail, role: "parent" });

      // 👇 If parent doesn’t exist → auto-create without password
      if (!parentAccount) {
        parentAccount = new User({
          name: parentName,
          email: parentEmail,
          role: "parent",
          parentPhone,
          password: null,         // no password yet
          needsActivation: true   // must set password later
        });
        await parentAccount.save();
      }
    }

    // ✅ Create the new user (student, teacher, or parent)
    const user = new User({
      name,
      email,
      password,
      role,
      studentPhone: role === "student" ? studentPhone : undefined,
      parentName: role === "student" ? parentName : undefined,
      parentPhone: role === "student" ? parentPhone : undefined,
      parentId: parentAccount ? parentAccount._id : undefined,
      schoolId: role === "student" ? schoolId : null,  

    });

    await user.save();

    // ✅ If student → link them to parent
    if (role === "student" && parentAccount) {
      if (!parentAccount.children) parentAccount.children = [];
      parentAccount.children.push(user._id);
      await parentAccount.save();
    }

    res.json({ msg: "✅ User registered successfully", user });
  } catch (err) {
    console.error("❌ Registration error:", err.message);
    res.status(500).json({ msg: "❌ Error registering user", error: err.message });
  }
});




// Login
router.post("/login", async (req, res) => {
  try {
    let { email, password } = req.body;

    // normalize email
    email = email.toLowerCase();

    // find user
    const user = await User.findOne({ email });
    if (!user) return res.status(400).json({ msg: "❌ User not found" });

    // 🔹 If parent account exists but needs activation (no password yet)
    if (user.role === "parent" && user.needsActivation) {
      return res.status(403).json({
        msg: "Parent account requires password setup",
        activationRequired: true,
        email: user.email,
      });
    }

    // check password (only if user has one)
    if (!user.password) {
      return res.status(400).json({ msg: "❌ No password set. Please activate your account." });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) return res.status(400).json({ msg: "❌ Invalid credentials" });

    // 🔹 if student, fetch their group
    let group = null;
    if (user.role === "student") {
      group = await Group.findOne({ students: user._id }).select("_id name yearId");
    }

    // create JWT token
    const token = jwt.sign(
      { id: user._id, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: "1d" }
    );

    // response
    res.json({
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        groupId: group?._id || null,
        groupName: group?.name || null,
      },
    });
  } catch (err) {
    console.error("❌ Login error:", err.message);
    res.status(500).json({ msg: "❌ Error logging in", error: err.message });
  }
});



// Get all students
router.get("/students", async (req, res) => {
  try {
    const students = await User.find({ role: "student" }).select("_id name email");
    res.json(students);
  } catch (err) {
    res.status(500).json({ msg: "❌ Error fetching students", error: err.message });
  }
});


// Get parent’s children
router.get("/parent/:id/students", async (req, res) => {
  try {
    const parent = await User.findById(req.params.id)
      .populate({
        path: "children",
        select: "name studentPhone groupId yearId",
        populate: [
          { path: "groupId", select: "name" },
          { path: "yearId", select: "name" }
        ]
      });

    if (!parent) return res.status(404).json({ msg: "Parent not found" });

    res.json(parent.children);
  } catch (err) {
    res.status(500).json({ msg: "❌ Error fetching parent’s students", error: err.message });
  }
});

// Set Password first Time Parent Login
router.post("/parent/set-password", async (req, res) => {
  const { email, newPassword } = req.body;

  const parent = await User.findOne({ email, role: "parent" });
  if (!parent) return res.status(404).json({ msg: "Parent not found" });

  if (!parent.needsActivation) {
    return res.status(400).json({ msg: "Password already set" });
  }

  parent.password = newPassword; // hashed by pre-save hook
  parent.needsActivation = false;
  await parent.save();

  res.json({ msg: "✅ Password set successfully, you can now log in" });
});

// 1️⃣ Request password reset
router.post("/forgot-password", async (req, res) => {
  try {
    const { email } = req.body;
    const user = await User.findOne({ email });
    if (!user) return res.status(404).json({ msg: "User not found" });

    // generate reset token
    const token = crypto.randomBytes(32).toString("hex");
    user.resetPasswordToken = token;
    user.resetPasswordExpires = Date.now() + 15 * 60 * 1000; // 15 mins
    await user.save();

    // send email
    const resetURL = `${process.env.FRONTEND_URL}/reset-password/${token}`;
    await transporter.sendMail({
      to: user.email,
      from: process.env.EMAIL_USER,
      subject: "Password Reset",
      html: `
        <h3>Password Reset Request</h3>
        <p>Click the link below to reset your password:</p>
        <a href="${resetURL}">${resetURL}</a>
        <p>This link will expire in 15 minutes.</p>
      `,
    });

    res.json({ msg: "Password reset link sent to your email" });
  } catch (err) {
    res.status(500).json({ msg: "Error sending reset email", error: err.message });
  }
});

// Reset Password
router.post("/reset-password/:token", async (req, res) => {
  try {
    const { token } = req.params;
    const { password } = req.body;

    const user = await User.findOne({
      resetPasswordToken: token,
      resetPasswordExpires: { $gt: Date.now() }, // token still valid
    });

    if (!user) {
      return res.status(400).json({ msg: "❌ Invalid or expired token" });
    }

    // set new password (will be hashed by pre-save hook)
    user.password = password;
    user.resetPasswordToken = undefined;
    user.resetPasswordExpires = undefined;

    await user.save();

    res.json({ msg: "✅ Password reset successful. Please log in." });
  } catch (err) {
    console.error("❌ Reset password error:", err);
    res.status(500).json({ msg: "❌ Error resetting password" });
  }
});



module.exports = router;
