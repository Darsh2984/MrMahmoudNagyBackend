// cron/weeklyReport.js

const cron = require("node-cron");
const axios = require("axios");
const User = require("../models/User");
const Task = require("../models/Task");
const QuizSubmission = require("../models/QuizSubmission");
const Submission = require("../models/Submission");
const Session = require("../models/Session");
const { sendMessage } = require("../utils/wapilot");

const BASE_URL = process.env.BASE_URL || "http://localhost:5000";

// ---------------------------------------------------------
// ✅ Throttling: Send 2 messages then wait 60 seconds
// ---------------------------------------------------------
const DELAY_AFTER_MESSAGES = 2;
const DELAY_MS = 60000;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ---------------------------------------------------------
// 🔹 Format Performance Report
// ---------------------------------------------------------
function formatPerformanceReport(name, performance, fromDate, toDate) {
  const totalSessions = performance.attendance.length;
  const presents = performance.attendance.filter((a) => a.present).length;
  const absents = totalSessions - presents;

  const tasks = performance.tasks.length
    ? performance.tasks
        .map((t) => `• ${t.title}: ${t.submitted ? "Submitted" : "Not Submitted"}`)
        .join("\n")
    : "No Tasks Due This Period";

  const onlineQuizzes = performance.quizzes.length
    ? performance.quizzes
        .map((q) => `• ${q.quizTitle}: ${q.score}/${q.total}`)
        .join("\n")
    : "No Online Quiz Submissions This Period";

  const inClass = performance.inClassQuizzes.length
    ? performance.inClassQuizzes
        .map(
          (q) =>
            `• ${q.quizName}: ${q.score}/${q.total} – ${q.percentage ?? "—"}% (${q.letterGrade ?? "—"})`
        )
        .join("\n")
    : "No In-Class Quizzes This Period";

  return `
📘 *Performance Report (Last 2 Weeks) – ${name} with MR Mahmoud Nagy*
📅 ${fromDate.toDateString()} → ${toDate.toDateString()}

🟦 *Attendance*
• ${presents} Present
• ${absents} Absent

🟩 *Tasks (By Deadline)*
${tasks}

🟧 *Online Quizzes (By Submission Date)*
${onlineQuizzes}

🟪 *In-Class Quizzes (By Quiz Date)*
${inClass}

——
`;
}

// ---------------------------------------------------------
// 🔹 Main Job (ALL STUDENTS)
// ---------------------------------------------------------
async function sendWeeklyReports() {
  try {
    console.log("🚀 Running performance report (LAST 2 WEEKS) for ALL students...");

    const now = new Date();
    now.setHours(23, 59, 59, 999);

    const fourteenDaysAgo = new Date(now);
    fourteenDaysAgo.setDate(now.getDate() - 14);
    fourteenDaysAgo.setHours(0, 0, 0, 0);

    const students = await User.find({ role: "student" }).populate("parentId");

    let messagesSent = 0;

    for (const student of students) {
      try {
        if (!student.groupId) continue;

        const groupId = student.groupId;

        // 1️⃣ Attendance
        const sessionsInWindow = await Session.find({
          groupId,
          date: { $gte: fourteenDaysAgo, $lte: now }
        });

        const attendance = sessionsInWindow.map((session) => {
          const studentAttendance = session.attendance.find(
            (a) => a.studentId.toString() === student._id.toString()
          );

          return {
            date: session.date,
            title: session.title,
            present: studentAttendance?.status === "Present"
          };
        });

        // 2️⃣ Tasks
        const tasksInWindow = await Task.find({
          groups: groupId,
          deadline: { $gte: fourteenDaysAgo, $lte: now }
        });

        const submissions = await Submission.find({
          studentId: student._id,
          taskId: { $in: tasksInWindow.map((t) => t._id) }
        });

        const tasks = tasksInWindow.map((t) => ({
          title: t.title,
          submitted: submissions.some((s) => s.taskId.toString() === t._id.toString())
        }));

        // 3️⃣ Online Quizzes
        const submissionsInWindow = await QuizSubmission.find({
          studentId: student._id,
          submittedAt: { $gte: fourteenDaysAgo, $lte: now },
          isSubmitted: true
        }).populate("quizId");

        const quizzes = submissionsInWindow.map((s) => ({
          quizTitle: s.quizId.title,
          score: s.score,
          total: s.quizId.questions.length
        }));

        // 4️⃣ In-Class Quizzes
        const performanceRes = await axios.get(
          `${BASE_URL}/api/performance/student/${student._id}`
        );

        let inClassQuizzes = performanceRes.data.inClassQuizzes || [];

        inClassQuizzes = inClassQuizzes.filter((q) => {
          const quizDate = new Date(q.date);
          return quizDate >= fourteenDaysAgo && quizDate <= now;
        });

        const performance = {
          attendance,
          tasks,
          quizzes,
          inClassQuizzes
        };

        const reportText = formatPerformanceReport(
          student.name,
          performance,
          fourteenDaysAgo,
          now
        );

        // -------------------------------------------------
        // Send to Student
        // -------------------------------------------------
        if (student.studentPhone) {
          console.log(`📤 Sending to student: ${student.name}`);
          await sendMessage(`${student.studentPhone}@c.us`, reportText);
          messagesSent++;

          if (messagesSent % DELAY_AFTER_MESSAGES === 0) {
            console.log("⏳ Waiting 60 seconds...");
            await sleep(DELAY_MS);
          }
        }

        // -------------------------------------------------
        // Send to Parent
        // -------------------------------------------------
        const parentPhone =
          student.parentPhone ||
          student.parentId?.parentPhone ||
          null;

        if (parentPhone) {
          console.log(`📤 Sending to parent of: ${student.name}`);
          await sendMessage(`${parentPhone}@c.us`, reportText);
          messagesSent++;

          if (messagesSent % DELAY_AFTER_MESSAGES === 0) {
            console.log("⏳ Waiting 60 seconds...");
            await sleep(DELAY_MS);
          }
        }

      } catch (err) {
        console.error(`❌ Error processing ${student.name}:`, err.message);
      }
    }

    console.log("🎉 Reports finished successfully.");
  } catch (err) {
    console.error("❌ Report job FAILED:", err.message);
  }
}

// ---------------------------------------------------------
// 🔹 Schedule Every Sunday 12:00 Cairo Time
// ---------------------------------------------------------
cron.schedule(
  "15 12 23 2 *",
  async () => {
    console.log("🕛 One-time job triggered (23 Feb 12:15 PM)");
    await sendWeeklyReports();
  },
  {
    scheduled: true,
    timezone: "Africa/Cairo"
  }
);

module.exports = { sendWeeklyReports };
