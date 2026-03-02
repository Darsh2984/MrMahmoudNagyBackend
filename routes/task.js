const express = require("express");
const axios = require("axios");
const router = express.Router();
const Task = require("../models/Task");
const Submission = require("../models/Submission");
const multer = require("multer");
const User = require("../models/User");
const transporter = require("../config/nodemailer");
const { sendMessage } = require("../utils/wapilot");


// ----------------- Multer In-Memory -----------------
const upload = multer({ storage: multer.memoryStorage() });
const uploadCorrected = multer({ storage: multer.memoryStorage() });

// ----------------- Bunny Config -----------------
const BUNNY_STORAGE_ZONE = process.env.BUNNY_STORAGE_ZONE;
const BUNNY_ACCESS_KEY = process.env.BUNNY_ACCESS_KEY;
const BUNNY_STORAGE_HOST = "https://uk.storage.bunnycdn.com";

// ----------------- Helper: Resolve Teacher ID -----------------
async function resolveTeacherId(teacherId) {
  const user = await User.findById(teacherId);
  if (!user) return null;
  return user.assistantOf || user._id;
}

// ----------------- Create Task -----------------
router.post("/task", async (req, res) => {
  try {
    let { title, description, teacherId, yearId, groups, deadline, gradeOutOf } = req.body;

    if (!groups || !Array.isArray(groups) || groups.length === 0) {
      return res.status(400).json({ msg: "❌ At least one group must be selected" });
    }

    teacherId = await resolveTeacherId(teacherId);
    if (!teacherId) return res.status(404).json({ msg: "❌ Teacher not found" });

    // ✅ Store UTC directly (frontend already sends UTC ISO)
    const task = new Task({
      title,
      description,
      teacherId,
      yearId,
      groups,
      deadline: deadline ? new Date(deadline) : null,
      gradeOutOf,
    });

    await task.save();

    // ✅ Respond immediately — no waiting for notifications
    res.json({ msg: "✅ Task created successfully", task });

    // ---------------- BACKGROUND NOTIFICATION TASK ----------------
    (async () => {
      try {
        const utcDeadline = deadline ? new Date(deadline) : null;

        const deadlineMsg = utcDeadline
          ? utcDeadline.toLocaleString("en-GB", {
              timeZone: "Africa/Cairo",
            }) + " (Cairo Local Time)"
          : "No deadline";

        const students = await User.find({ role: "student", groupId: { $in: groups } })
          .select("name email studentPhone parentPhone parentId")
          .populate("parentId", "name email parentPhone");

        for (const student of students) {
          const studentMsg = `📝 New Task Assigned\n\nTitle: ${title}\nDescription: ${
            description || "No description"
          }\nDeadline: ${deadlineMsg}\nMarks: Out of ${gradeOutOf}`;
          const parentMsg = `📢 New Task for Your Child\n\nTitle: ${title}\nDescription: ${
            description || "No description"
          }\nDeadline: ${deadlineMsg}\nMarks: Out of ${gradeOutOf}`;

          // 🔹 Send Email to Student
          if (student.email) {
            transporter
              .sendMail({
                to: student.email,
                from: process.env.EMAIL_USER,
                subject: `📝 New Task Assigned: ${title}`,
                html: `
                  <h3>New Task Assigned</h3>
                  <p>Hello <b>${student.name}</b>,</p>
                  <ul>
                    <li><b>Title:</b> ${title}</li>
                    <li><b>Description:</b> ${description || "No description"}</li>
                    <li><b>Deadline:</b> ${deadlineMsg}</li>
                    <li><b>Marks:</b> Out of ${gradeOutOf}</li>
                  </ul>
                `,
              })
              .catch((err) =>
                console.warn(`⚠️ Failed to send email to ${student.email}:`, err.message)
              );
          }

          // // 🔹 WhatsApp to Student
          // if (student.studentPhone) {
          //   sendMessage(`${student.studentPhone}@c.us`, studentMsg).catch((err) =>
          //     console.warn(`⚠️ Failed WhatsApp to student ${student.name}:`, err.message)
          //   );
          // }

          // // 🔹 WhatsApp to Parent
          // const parentPhone = student.parentPhone || student.parentId?.parentPhone;
          // if (parentPhone) {
          //   sendMessage(`${parentPhone}@c.us`, parentMsg).catch((err) =>
          //     console.warn(`⚠️ Failed WhatsApp to parent of ${student.name}:`, err.message)
          //   );
          // }

          // 🔹 Email to Parent
          if (student.parentId?.email) {
            transporter
              .sendMail({
                to: student.parentId.email,
                from: process.env.EMAIL_USER,
                subject: `📢 Your Child Has a New Task: ${title}`,
                html: `
                  <h3>New Task Notification</h3>
                  <p>Hello <b>${student.parentId.name}</b>,</p>
                  <p>A new task has been assigned to your child <b>${student.name}</b>.</p>
                  <ul>
                    <li><b>Title:</b> ${title}</li>
                    <li><b>Description:</b> ${description || "No description"}</li>
                    <li><b>Deadline:</b> ${deadlineMsg}</li>
                    <li><b>Marks:</b> Out of ${gradeOutOf}</li>
                  </ul>
                `,
              })
              .catch((err) =>
                console.warn(`⚠️ Failed to send email to parent ${student.parentId.email}:`, err.message)
              );
          }
        }
      } catch (bgErr) {
        console.error("⚠️ Background notification error:", bgErr.message);
      }
    })();
  } catch (err) {
    console.error("❌ Error creating task:", err.message);
    res.status(500).json({ msg: "❌ Error creating task", error: err.message });
  }
});


// ----------------- Edit Task -----------------
router.put("/task/:id", async (req, res) => {
  try {
    const { title, description, deadline, gradeOutOf } = req.body;

    // ✅ Same logic: the frontend sends UTC (Z)
    const task = await Task.findByIdAndUpdate(
      req.params.id,
      {
        title,
        description,
        deadline: deadline ? new Date(deadline) : null,
        gradeOutOf,
      },
      { new: true }
    );

    if (!task) return res.status(404).json({ msg: "❌ Task not found" });
    res.json({ msg: "✅ Task updated", task });
  } catch (err) {
    console.error("❌ Error updating task:", err.message);
    res.status(500).json({ msg: "❌ Error updating task", error: err.message });
  }
});


// ----------------- Delete Task -----------------
router.delete("/task/:id", async (req, res) => {
  try {
    const task = await Task.findByIdAndDelete(req.params.id);
    if (!task) return res.status(404).json({ msg: "❌ Task not found" });

    await Submission.deleteMany({ taskId: req.params.id });
    res.json({ msg: "✅ Task deleted" });
  } catch (err) {
    res.status(500).json({ msg: "❌ Error deleting task", error: err.message });
  }
});

// ----------------- Student Upload Submission -----------------
router.post("/submission", upload.single("file"), async (req, res) => {
  try {
    console.log("---- Upload Request Received ----");
    console.log("Task ID:", req.body.taskId);
    console.log("Student ID:", req.body.studentId);

    const { taskId, studentId } = req.body;

    if (!req.file) {
      console.error("❌ No file uploaded from client");
      return res.status(400).json({ msg: "No file uploaded" });
    }

    console.log("File Info:");
    console.log("Original Name:", req.file.originalname);
    console.log("Size (bytes):", req.file.size);
    console.log("Mime Type:", req.file.mimetype);

    const fileName = Date.now() + "-" + req.file.originalname;
    const path = `submissions/${fileName}`;
    const uploadUrl = `${BUNNY_STORAGE_HOST}/${BUNNY_STORAGE_ZONE}/${path}`;

    console.log("Uploading to Bunny URL:", uploadUrl);

    await axios.put(uploadUrl, req.file.buffer, {
      headers: {
        AccessKey: BUNNY_ACCESS_KEY,
        "Content-Type": "application/octet-stream",
      },
      maxBodyLength: Infinity,
    });

    console.log("✅ Bunny upload successful");

    const cdnUrl = `https://cdn.layth-eg.com/${path}`;
    const submission = new Submission({ taskId, studentId, fileUrl: cdnUrl });

    await submission.save();

    console.log("✅ Submission saved to database");

    res.json({ msg: "Submission uploaded", submission });

  } catch (err) {

    console.error("❌❌❌ UPLOAD ERROR START ❌❌❌");

    // Full raw error
    console.error("Error Object:", err);

    // Axios specific error details
    if (err.response) {
      console.error("Axios Response Status:", err.response.status);
      console.error("Axios Response Data:", err.response.data);
      console.error("Axios Response Headers:", err.response.headers);
    }

    if (err.request) {
      console.error("Axios Request:", err.request);
    }

    console.error("Error Message:", err.message);
    console.error("Stack Trace:", err.stack);

    console.error("❌❌❌ UPLOAD ERROR END ❌❌❌");

    res.status(500).json({
      msg: "Error uploading submission",
      error: err.message,
    });
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

    const updateData = { comments, grade, gradedAt: new Date() };

    if (req.file) {
      if (submission.correctedFileUrl) {
        const oldPath = submission.correctedFileUrl.split(".b-cdn.net/")[1];
        const deleteUrl = `${BUNNY_STORAGE_HOST}/${BUNNY_STORAGE_ZONE}/${oldPath}`;
        try {
          await axios.delete(deleteUrl, { headers: { AccessKey: BUNNY_ACCESS_KEY } });
        } catch (err) {
          console.warn("⚠️ Failed to delete old corrected file:", err.message);
        }
      }

      const fileName = Date.now() + "-corrected-" + req.file.originalname;
      const path = `corrected/${fileName}`;
      const uploadUrl = `${BUNNY_STORAGE_HOST}/${BUNNY_STORAGE_ZONE}/${path}`;

      await axios.put(uploadUrl, req.file.buffer, {
        headers: { AccessKey: BUNNY_ACCESS_KEY, "Content-Type": "application/octet-stream" },
        maxBodyLength: Infinity,
      });

      updateData.correctedFileUrl = `https://layth-eg.b-cdn.net/${path}`;
    }

    const updated = await Submission.findByIdAndUpdate(req.params.submissionId, updateData, { new: true });
    res.json({ msg: "✅ Submission graded", submission: updated });
  } catch (err) {
    res.status(500).json({ msg: "❌ Error grading submission", error: err.message });
  }
});

// ----------------- Delete Submission -----------------
router.delete("/submission/:id", async (req, res) => {
  try {
    const submission = await Submission.findById(req.params.id);
    if (!submission) return res.status(404).json({ msg: "❌ Submission not found" });

    if (submission.fileUrl) {
      const path = submission.fileUrl.split(".b-cdn.net/")[1];
      const deleteUrl = `${BUNNY_STORAGE_HOST}/${BUNNY_STORAGE_ZONE}/${path}`;
      try {
        await axios.delete(deleteUrl, { headers: { AccessKey: BUNNY_ACCESS_KEY } });
      } catch (err) {
        console.warn("⚠️ Failed to delete submission file:", err.message);
      }
    }

    if (submission.correctedFileUrl) {
      const path = submission.correctedFileUrl.split(".b-cdn.net/")[1];
      const deleteUrl = `${BUNNY_STORAGE_HOST}/${BUNNY_STORAGE_ZONE}/${path}`;
      try {
        await axios.delete(deleteUrl, { headers: { AccessKey: BUNNY_ACCESS_KEY } });
      } catch (err) {
        console.warn("⚠️ Failed to delete corrected file:", err.message);
      }
    }

    await Submission.findByIdAndDelete(req.params.id);
    res.json({ msg: "✅ Submission deleted" });
  } catch (err) {
    res.status(500).json({ msg: "❌ Error deleting submission", error: err.message });
  }
});

// ----------------- Teacher Marks Student as Submitted -----------------
router.post("/submission/manual", async (req, res) => {
  try {
    const { taskId, studentId, teacherId } = req.body;

    if (!taskId || !studentId || !teacherId)
      return res.status(400).json({ msg: "❌ Missing data" });

    // Check if already exists
    const existing = await Submission.findOne({ taskId, studentId });
    if (existing)
      return res.status(400).json({ msg: "⚠️ This student already has a submission" });

    // Resolve teacher (handle assistant accounts)
    const resolvedTeacherId = await resolveTeacherId(teacherId);
    if (!resolvedTeacherId)
      return res.status(404).json({ msg: "❌ Teacher not found" });

    // Create manual submission (no file)
    const submission = new Submission({
      taskId,
      studentId,
      teacherId: resolvedTeacherId,
      fileUrl: null,
      grade: null,
      comments: "Marked as submitted manually by teacher",
      manual: true, // optional field (you can add to your model)
      createdAt: new Date(),
    });

    await submission.save();

    res.json({ msg: "✅ Student marked as submitted", submission });
  } catch (err) {
    console.error("❌ Error marking as submitted:", err.message);
    res.status(500).json({ msg: "❌ Error marking as submitted", error: err.message });
  }
}); 

// ----------------- Remove Corrected File Only -----------------
router.delete("/submission/:id/corrected", async (req, res) => {
  try {
    const submission = await Submission.findById(req.params.id);
    if (!submission) return res.status(404).json({ msg: "❌ Submission not found" });

    if (!submission.correctedFileUrl) {
      return res.status(400).json({ msg: "⚠️ No corrected file to delete" });
    }

    const path = submission.correctedFileUrl.split(".b-cdn.net/")[1];
    const deleteUrl = `${BUNNY_STORAGE_HOST}/${BUNNY_STORAGE_ZONE}/${path}`;

    try {
      await axios.delete(deleteUrl, { headers: { AccessKey: BUNNY_ACCESS_KEY } });
    } catch (err) {
      console.warn("⚠️ Failed to delete corrected file from Bunny:", err.message);
      // Keep going so DB is consistent even if Bunny delete fails
    }

    submission.correctedFileUrl = null;
    await submission.save();

    res.json({ msg: "✅ Corrected file removed", submission });
  } catch (err) {
    res.status(500).json({ msg: "❌ Error removing corrected file", error: err.message });
  }
});




module.exports = router;
