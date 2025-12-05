// cron/weeklyReport.js
const cron = require("node-cron");
const axios = require("axios");
const User = require("../models/User");
const { sendMessage } = require("../utils/wapilot");

// Your backend URL (needed to call the existing performance endpoint)
const BASE_URL = process.env.BASE_URL || "https://yourdomain.com"; 
// EXAMPLE: "http://localhost:5000" OR "https://yourapp.com"

// ---------------------------------------------------------
// 🔹 Format Weekly Performance Report (Student + Parent)
// ---------------------------------------------------------
function formatPerformanceReport(name, performance) {

  // Attendance
  const totalSessions = performance.attendance.length;
  const presents = performance.attendance.filter(a => a.present).length;
  const absents = totalSessions - presents;

  // Tasks
  const tasks = performance.tasks
    .map(t => `• ${t.title}: ${t.submitted ? "Submitted" : "Not Submitted"}`)
    .join("\n");

  // Online Quizzes
  const onlineQuizzes = performance.quizzes
    .map(q =>
      `• ${q.quizTitle}: ${
        q.score !== null ? `${q.score}/${q.total}` : "Not Attempted"
      }`
    )
    .join("\n");

  // In-Class Quizzes
  const inClass = performance.inClassQuizzes
    .map(q =>
      `• ${q.quizName}: ${
        q.score !== null
          ? `${q.score}/${q.total} – ${q.percentage ?? "—"}% (${q.letterGrade ?? "—"})`
          : "Not Graded"
      }`
    )
    .join("\n");

  return `
📘 *Weekly Performance Report – ${name}*

🟦 *Attendance*
• ${presents} Present
• ${absents} Absent

🟩 *Tasks*
${tasks || "No Tasks"}

🟧 *Online Quizzes*
${onlineQuizzes || "No Online Quizzes"}

🟪 *In-Class Quizzes*
${inClass || "No In-Class Quizzes"}

——
📅 *This report is generated automatically every Sunday at 12 PM.*
`;
}

// ---------------------------------------------------------
// 🔹 Main Job → Send Weekly Reports
// ---------------------------------------------------------
async function sendWeeklyReports() {
  try {
    console.log("⏳ Running weekly performance report job...");

    // 1️⃣ Fetch all students
    const students = await User.find({ role: "student" }).populate("parentId");

    for (const student of students) {
      try {
        if (!student.groupId) continue; // skip unassigned students

        // 2️⃣ Fetch performance using EXISTING API
        const performanceRes = await axios.get(
          `${BASE_URL}/api/performance/student/${student._id}`
        );

        const performance = performanceRes.data;
        const reportText = formatPerformanceReport(student.name, performance);

        // 3️⃣ Send to student
        if (student.studentPhone) {
          await sendMessage(`${student.studentPhone}@c.us`, reportText);
          console.log(`📤 Sent report to student: ${student.name}`);
        }

        // 4️⃣ Send to parent
        const parentPhone =
          student.parentPhone ||
          student.parentId?.parentPhone || 
          null;

        if (parentPhone) {
          await sendMessage(`${parentPhone}@c.us`, reportText);
          console.log(`📤 Sent report to parent of: ${student.name}`);
        }

      } catch (err) {
        console.error(`❌ Error sending report for ${student.name}:`, err.message);
      }
    }

    console.log("✅ Weekly report job complete.");

  } catch (err) {
    console.error("❌ Weekly report job FAILED:", err.message);
  }
}

// ---------------------------------------------------------
// 🔹 Schedule Job → Every Sunday at 12:00 PM Cairo Time
// ---------------------------------------------------------
cron.schedule(
  "0 12 * * SUN",
  () => {
    console.log("🕛 Weekly scheduled job triggered!");
    sendWeeklyReports();
  },
  { scheduled: true, timezone: "Africa/Cairo" }
);

module.exports = { sendWeeklyReports };
