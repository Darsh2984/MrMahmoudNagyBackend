const express = require("express");
const axios = require("axios");
const router = express.Router();
const Task = require("../models/Task");
const Submission = require("../models/Submission");
const multer = require("multer");

// ----------------- Multer In-Memory -----------------
const upload = multer({ storage: multer.memoryStorage() });
const uploadCorrected = multer({ storage: multer.memoryStorage() });

// ----------------- Bunny Config -----------------
const BUNNY_STORAGE_ZONE = process.env.BUNNY_STORAGE_ZONE; 
const BUNNY_ACCESS_KEY = process.env.BUNNY_ACCESS_KEY;
const BUNNY_STORAGE_HOST = "https://uk.storage.bunnycdn.com"; 

// ----------------- Create Task -----------------
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
      groups,
      deadline,
      gradeOutOf,
    });

    await task.save();
    res.json({ msg: "✅ Task created", task });
  } catch (err) {
    res.status(500).json({ msg: "❌ Error creating task", error: err.message });
  }
});

// ----------------- Student Upload Submission -----------------
router.post("/submission", upload.single("file"), async (req, res) => {
  try {
    const { taskId, studentId } = req.body;
    if (!req.file) return res.status(400).json({ msg: "❌ No file uploaded" });

    const fileName = Date.now() + "-" + req.file.originalname;
    const path = `submissions/${fileName}`;
    const uploadUrl = `${BUNNY_STORAGE_HOST}/${BUNNY_STORAGE_ZONE}/${path}`;

    await axios.put(uploadUrl, req.file.buffer, {
      headers: {
        AccessKey: BUNNY_ACCESS_KEY,
        "Content-Type": "application/octet-stream",
      },
      maxBodyLength: Infinity,
    });

    const cdnUrl = `https://layth-eg.b-cdn.net/${path}`;

    const submission = new Submission({
      taskId,
      studentId,
      fileUrl: cdnUrl,
    });

    await submission.save();
    res.json({ msg: "✅ Submission uploaded", submission });
  } catch (err) {
    res.status(500).json({ msg: "❌ Error uploading submission", error: err.message });
  }
});

// ----------------- Get Submissions for a Task -----------------
router.get("/submission/:taskId", async (req, res) => {
  try {
    const submissions = await Submission.find({ taskId: req.params.taskId }).populate("studentId");
    res.json(submissions);
  } catch (err) {
    res.status(500).json({ msg: "❌ Error fetching submissions", error: err.message });
  }
});

// ----------------- Get All Tasks for a Group -----------------
router.get("/group/:groupId", async (req, res) => {
  try {
    const tasks = await Task.find({ groups: req.params.groupId }).sort({ deadline: 1 });
    res.json(tasks);
  } catch (err) {
    res.status(500).json({ msg: "❌ Error fetching tasks", error: err.message });
  }
});

// ----------------- Teacher Grades a Submission -----------------
router.put("/submission/:submissionId/grade", uploadCorrected.single("file"), async (req, res) => {
  try {
    const { comments, grade } = req.body;

    const submission = await Submission.findById(req.params.submissionId);
    if (!submission) return res.status(404).json({ msg: "❌ Submission not found" });

    const updateData = {
      comments,
      grade,
      gradedAt: new Date(),
    };

    if (req.file) {
      // 🔹 If old corrected file exists → delete from Bunny
      if (submission.correctedFileUrl) {
        const oldPath = submission.correctedFileUrl.split(".b-cdn.net/")[1];
        const deleteUrl = `${BUNNY_STORAGE_HOST}/${BUNNY_STORAGE_ZONE}/${oldPath}`;
        try {
          await axios.delete(deleteUrl, { headers: { AccessKey: BUNNY_ACCESS_KEY } });
        } catch (delErr) {
          console.warn("⚠️ Failed to delete old corrected file:", delErr.message);
        }
      }

      // 🔹 Upload new corrected file
      const fileName = Date.now() + "-corrected-" + req.file.originalname;
      const path = `corrected/${fileName}`;
      const uploadUrl = `${BUNNY_STORAGE_HOST}/${BUNNY_STORAGE_ZONE}/${path}`;

      await axios.put(uploadUrl, req.file.buffer, {
        headers: {
          AccessKey: BUNNY_ACCESS_KEY,
          "Content-Type": "application/octet-stream",
        },
        maxBodyLength: Infinity,
      });

      const cdnUrl = `https://${BUNNY_STORAGE_ZONE}.b-cdn.net/${path}`;
      updateData.correctedFileUrl = cdnUrl;
    }

    const updated = await Submission.findByIdAndUpdate(
      req.params.submissionId,
      updateData,
      { new: true }
    );

    res.json({ msg: "✅ Submission graded", submission: updated });
  } catch (err) {
    res.status(500).json({ msg: "❌ Error grading submission", error: err.message });
  }
});

// ----------------- Delete Submission -----------------
router.delete("/submission/:id", async (req, res) => {
  try {
    const submission = await Submission.findById(req.params.id);
    if (!submission) return res.status(404).json({ msg: "Submission not found" });

    // 🔹 Delete submission file from Bunny
    if (submission.fileUrl) {
      const path = submission.fileUrl.split(".b-cdn.net/")[1];
      const deleteUrl = `${BUNNY_STORAGE_HOST}/${BUNNY_STORAGE_ZONE}/${path}`;
      try {
        await axios.delete(deleteUrl, { headers: { AccessKey: BUNNY_ACCESS_KEY } });
      } catch (delErr) {
        console.warn("⚠️ Failed to delete submission file:", delErr.message);
      }
    }

    // 🔹 Delete corrected file if exists
    if (submission.correctedFileUrl) {
      const path = submission.correctedFileUrl.split(".b-cdn.net/")[1];
      const deleteUrl = `${BUNNY_STORAGE_HOST}/${BUNNY_STORAGE_ZONE}/${path}`;
      try {
        await axios.delete(deleteUrl, { headers: { AccessKey: BUNNY_ACCESS_KEY } });
      } catch (delErr) {
        console.warn("⚠️ Failed to delete corrected file:", delErr.message);
      }
    }

    await Submission.findByIdAndDelete(req.params.id);

    res.json({ msg: "✅ Submission deleted" });
  } catch (err) {
    res.status(500).json({ msg: "❌ Error deleting submission", error: err.message });
  }
});

module.exports = router;
