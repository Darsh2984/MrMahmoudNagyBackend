const express = require("express");
const router = express.Router();
const Task = require("../models/Task");
const Submission = require("../models/Submission");
const multer = require("multer");
const nodemailer = require("nodemailer");





// Storage setup for PDF uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, "uploads/"),
  filename: (req, file, cb) => cb(null, Date.now() + "-" + file.originalname)
});
const upload = multer({ storage });

const storageCorrected = multer.diskStorage({
  destination: (req, file, cb) => cb(null, "uploads/corrected/"),
  filename: (req, file, cb) => cb(null, Date.now() + "-corrected-" + file.originalname)
});
const uploadCorrected = multer({ storage: storageCorrected });


// Create Task
router.post("/task", async (req, res) => {
  try {
    const { title, description, teacherId, yearId, groups, deadline, gradeOutOf } = req.body;

    if (!groups || !Array.isArray(groups) || groups.length === 0) {
      return res.status(400).json({ msg: "❌ At least one group must be selected" });
    }

    const task = new Task({
      title,
      description,
      teacherId,
      yearId,
      groups, // ✅ save array of groups directly
      deadline,
      gradeOutOf,
    });

    await task.save();

    res.json({ msg: "✅ Task created", task });
  } catch (err) {
    res.status(500).json({ msg: "❌ Error creating task", error: err.message });
  }
});


// Student Upload Submission
router.post("/submission", upload.single("file"), async (req, res) => {
  try {
    const { taskId, studentId } = req.body;
    const submission = new Submission({
      taskId,
      studentId,
      fileUrl: `${req.protocol}://${req.get("host")}/uploads/${req.file.filename}`
    });
    await submission.save();
    res.json({ msg: "✅ Submission uploaded", submission });
  } catch (err) {
    res.status(500).json({ msg: "❌ Error uploading submission", error: err.message });
  }
});

// Get Submissions for a Task
router.get("/submission/:taskId", async (req, res) => {
  try {
    const submissions = await Submission.find({ taskId: req.params.taskId }).populate("studentId");
    res.json(submissions);
  } catch (err) {
    res.status(500).json({ msg: "❌ Error fetching submissions", error: err.message });
  }
});

// Get all tasks for a group
router.get("/group/:groupId", async (req, res) => {
  try {
    const tasks = await Task.find({ groupId: req.params.groupId }).sort({ deadline: 1 });
    res.json(tasks);
  } catch (err) {
    res.status(500).json({ msg: "❌ Error fetching tasks", error: err.message });
  }
});

// Storage for corrected PDFs


// Teacher grades a submission
router.put("/submission/:submissionId/grade", uploadCorrected.single("file"), async (req, res) => {
  try {
    const { comments, grade } = req.body;

    const updateData = {
      comments,
      grade,
      gradedAt: new Date(),
    };

    if (req.file) {
      updateData.correctedFileUrl = `${req.protocol}://${req.get("host")}/uploads/corrected/${req.file.filename}`;
    }

    const submission = await Submission.findByIdAndUpdate(
      req.params.submissionId,
      updateData,
      { new: true }
    );

    res.json({ msg: "✅ Submission graded", submission });
  } catch (err) {
    res.status(500).json({ msg: "❌ Error grading submission", error: err.message });
  }
});





module.exports = router;
