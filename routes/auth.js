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
    if (role === "student" && parentEmail) {
    parentEmail = parentEmail.toLowerCase();

    parentAccount = await User.findOne({ email: parentEmail, role: "parent" });

    // 👇 If parent doesn’t exist → auto-create without password
    if (!parentAccount) {
      parentAccount = new User({
        name: parentName,
        email: parentEmail,
        role: "parent",
        parentPhone,
        password: null,
        needsActivation: true
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

    // after successful login
    if (user.role === "student") {
      if (!user.parentId) {
        return res.status(403).json({
          msg: "Parent details required",
          parentDetailsRequired: true,
          studentId: user._id,
        });
      }
    }


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

// Update parent details for a student (and create parent account if missing)
router.post("/student/add-parent", async (req, res) => {
  try {
    const { studentId, parentName, parentEmail, parentPhone } = req.body;

    const student = await User.findById(studentId);
    if (!student || student.role !== "student") {
      return res.status(404).json({ msg: "Student not found" });
    }

    // normalize parent email
    const normalizedParentEmail = parentEmail.toLowerCase();

    // check if parent already exists
    let parentAccount = await User.findOne({ email: normalizedParentEmail, role: "parent" });

    if (!parentAccount) {
      // create new parent account with needsActivation = true
      parentAccount = new User({
        name: parentName,
        email: normalizedParentEmail,
        role: "parent",
        parentPhone,
        password: null,          // no password yet
        needsActivation: true,   // must activate later
        children: [student._id], // link child
      });
      await parentAccount.save();
    } else {
      // if parent already exists, just link the child
      if (!parentAccount.children.includes(student._id)) {
        parentAccount.children.push(student._id);
        await parentAccount.save();
      }
    }

    // update student with parent reference
    student.parentName = parentName;
    student.parentPhone = parentPhone;
    student.parentId = parentAccount._id;
    student.save();

    res.json({ msg: "✅ Parent details saved successfully", parent: parentAccount });
  } catch (err) {
    console.error("❌ Error saving parent details:", err);
    res.status(500).json({ msg: "❌ Error saving parent details", error: err.message });
  }
});


// Get all students (only unassigned to groups)
router.get("/students", async (req, res) => {
  try {
    const students = await User.find({ role: "student", groupId: null })
      .select("_id name email schoolId") 
      .populate("schoolId", "name"); 

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

// ✅ Validate user & refresh group membership
router.get("/validate/:id", async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ msg: "User not found" });

    let groupId = null;
    if (user.role === "student") {
      const group = await Group.findOne({ students: user._id }).select("_id");
      groupId = group?._id || null;
    }

    res.json({
      id: user._id,
      role: user.role,
      groupId,
    });
  } catch (err) {
    res.status(500).json({ msg: "❌ Error validating user", error: err.message });
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
    const resetURL = `${process.env.FRONTEND_URL}reset-password/${token}`;
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
