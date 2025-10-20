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

    // ✅ Convert teacher's local time → UTC before saving
    let utcDeadline = null;
    if (deadline) {
      const localDate = new Date(deadline); // "2025-09-24T23:00" interpreted as local
      utcDeadline = new Date(localDate.getTime() - localDate.getTimezoneOffset() * 60000);
    }

    const task = new Task({
      title,
      description,
      teacherId,
      yearId,
      groups,
      deadline: deadline ? new Date(deadline) : null, // always stored as UTC
      gradeOutOf,
    });

    await task.save();

    // ✅ Notify students & parents (use teacher local time for messages)
    const teacherLocalDeadline = new Date(deadline); // original string already local to teacher
    const students = await User.find({ role: "student", groupId: { $in: groups } })
      .select("name email studentPhone parentPhone parentId")
      .populate("parentId", "name email parentPhone");

    for (const student of students) {
        // ✅ Convert deadline to Cairo local time
        const deadlineMsg = teacherLocalDeadline.toLocaleString("en-GB", { timeZone: "Africa/Cairo" }) + " (Cairo Local Time)";

        // ✅ Messages
        const studentMsg = `📝 New Task Assigned\n\nTitle: ${title}\nDescription: ${description || "No description"}\nDeadline: ${deadlineMsg}\nMarks: Out of ${gradeOutOf}`;
        const parentMsg = `📢 New Task for Your Child\n\nTitle: ${title}\nDescription: ${description || "No description"}\nDeadline: ${deadlineMsg}\nMarks: Out of ${gradeOutOf}`;

        // 🔹 Email to student
        try {
          await transporter.sendMail({
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
          });
        } catch (err) {
          console.warn(`⚠️ Failed to send email to ${student.email}:`, err.message);
        }

        // 🔹 WhatsApp to student
        if (student.studentPhone) {
          try {
            await sendMessage(`${student.studentPhone}@c.us`, studentMsg);
            console.log(`✅ WhatsApp sent to student ${student.name}`);
          } catch (err) {
            console.warn(`⚠️ Failed to send WhatsApp to student ${student.name}:`, err.message);
          }
        }

        // 🔹 WhatsApp to parent (from student record or parentId)
        const parentPhone = student.parentPhone || student.parentId?.parentPhone;
        if (parentPhone) {
          try {
            await sendMessage(`${parentPhone}@c.us`, parentMsg);
            console.log(`✅ WhatsApp sent to parent of ${student.name}`);
          } catch (err) {
            console.warn(`⚠️ Failed to send WhatsApp to parent of ${student.name}:`, err.message);
          }
        }

        // 🔹 Email to parent
        if (student.parentId?.email) {
          try {
            await transporter.sendMail({
              to: student.parentId.email,
              from: process.env.EMAIL_USER,
              subject: `📢 Your Child Has a New Task: ${title}`,
              html: `
                <h3>New Task Notification</h3>
                <p>Hello <b>${student.parentId.name}</b>,</p>
                <p>A new task has been assigned to your child <b>${student.name}</b>. Details:</p>
                <ul>
                  <li><b>Title:</b> ${title}</li>
                  <li><b>Description:</b> ${description || "No description"}</li>
                  <li><b>Deadline:</b> ${deadlineMsg}</li>
                  <li><b>Marks:</b> Out of ${gradeOutOf}</li>
                </ul>
              `,
            });
          } catch (err) {
            console.warn(`⚠️ Failed to send email to parent ${student.parentId.email}:`, err.message);
          }
        }
      }


    res.json({ msg: "✅ Task created and notifications sent", task });
  } catch (err) {
    console.error("❌ Error creating task:", err.message);
    res.status(500).json({ msg: "❌ Error creating task", error: err.message });
  }
});

// ----------------- Edit Task -----------------
router.put("/task/:id", async (req, res) => {
  try {
    const { title, description, deadline, gradeOutOf } = req.body;

    const task = await Task.findByIdAndUpdate(
      req.params.id,
      {
        title,
        description,
        deadline: deadline ? new Date(deadline) : undefined, // ✅ store directly
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
    const { taskId, studentId } = req.body;
    if (!req.file) return res.status(400).json({ msg: "❌ No file uploaded" });

    const fileName = Date.now() + "-" + req.file.originalname;
    const path = `submissions/${fileName}`;
    const uploadUrl = `${BUNNY_STORAGE_HOST}/${BUNNY_STORAGE_ZONE}/${path}`;

    await axios.put(uploadUrl, req.file.buffer, {
      headers: { AccessKey: BUNNY_ACCESS_KEY, "Content-Type": "application/octet-stream" },
      maxBodyLength: Infinity,
    });

    const cdnUrl = `https://layth-eg.b-cdn.net/${path}`;
    const submission = new Submission({ taskId, studentId, fileUrl: cdnUrl });

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



module.exports = router;
