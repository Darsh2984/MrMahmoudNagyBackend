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

// 40 seconds delay (anti-ban protection)
const DELAY_MS = 60000;

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ---------------------------------------------------------
// 🔹 Format Weekly Performance Report
// ---------------------------------------------------------

function formatPerformanceReport(name, performance, fromDate, toDate) {

  const totalSessions = performance.attendance.length;
  const presents = performance.attendance.filter(a => a.present).length;
  const absents = totalSessions - presents;

  const tasks = performance.tasks.length
    ? performance.tasks
        .map(t => `• ${t.title}: ${t.submitted ? "Submitted" : "Not Submitted"}`)
        .join("\n")
    : "No Tasks Due This Week";

  const onlineQuizzes = performance.quizzes.length
    ? performance.quizzes
        .map(q => `• ${q.quizTitle}: ${q.score}/${q.total}`)
        .join("\n")
    : "No Online Quiz Submissions This Week";

  const inClass = performance.inClassQuizzes.length
    ? performance.inClassQuizzes
        .map(q =>
          `• ${q.quizName}: ${q.score}/${q.total} – ${q.percentage ?? "—"}% (${q.letterGrade ?? "—"})`
        )
        .join("\n")
    : "No In-Class Quizzes This Week";

  return `
📘 *Weekly Performance Report – ${name}*
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
// 🔹 Main Weekly Job (ALL STUDENTS)
// ---------------------------------------------------------

async function sendWeeklyReports() {
  try {
    console.log("🚀 Running weekly report for ALL students...");

    // -------------------------------------------------
    // Rolling 7-Day Window
    // -------------------------------------------------

    const now = new Date();
    now.setHours(23, 59, 59, 999);

    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(now.getDate() - 7);
    sevenDaysAgo.setHours(0, 0, 0, 0);

    // -------------------------------------------------
    // Fetch All Students
    // -------------------------------------------------

    const students = await User.find({ role: "student" }).populate("parentId");

    for (const student of students) {
      try {

        if (!student.groupId) continue;

        const groupId = student.groupId;

        // -------------------------------------------------
        // 1️⃣ Attendance
        // -------------------------------------------------

        const weeklySessions = await Session.find({
          groupId,
          date: { $gte: sevenDaysAgo, $lte: now }
        });

        const attendance = weeklySessions.map(session => {
          const studentAttendance = session.attendance.find(a =>
            a.studentId.toString() === student._id.toString()
          );

          return {
            date: session.date,
            title: session.title,
            present: studentAttendance?.status === "Present"
          };
        });

        // -------------------------------------------------
        // 2️⃣ Tasks
        // -------------------------------------------------

        const weeklyTasks = await Task.find({
          groups: groupId,
          deadline: { $gte: sevenDaysAgo, $lte: now }
        });

        const submissions = await Submission.find({
          studentId: student._id,
          taskId: { $in: weeklyTasks.map(t => t._id) }
        });

        const tasks = weeklyTasks.map(t => ({
          title: t.title,
          submitted: submissions.some(
            s => s.taskId.toString() === t._id.toString()
          )
        }));

        // -------------------------------------------------
        // 3️⃣ Online Quizzes
        // -------------------------------------------------

        const weeklySubmissions = await QuizSubmission.find({
          studentId: student._id,
          submittedAt: { $gte: sevenDaysAgo, $lte: now },
          isSubmitted: true
        }).populate("quizId");

        const quizzes = weeklySubmissions.map(s => ({
          quizTitle: s.quizId.title,
          score: s.score,
          total: s.quizId.questions.length
        }));

        // -------------------------------------------------
        // 4️⃣ In-Class Quizzes
        // -------------------------------------------------

        const performanceRes = await axios.get(
          `${BASE_URL}/api/performance/student/${student._id}`
        );

        let inClass = performanceRes.data.inClassQuizzes;

        inClass = inClass.filter(q => {
          const quizDate = new Date(q.date);
          return quizDate >= sevenDaysAgo && quizDate <= now;
        });

        // -------------------------------------------------
        // Build Performance Object
        // -------------------------------------------------

        const performance = {
          attendance,
          tasks,
          quizzes,
          inClassQuizzes: inClass
        };

        const reportText = formatPerformanceReport(
          student.name,
          performance,
          sevenDaysAgo,
          now
        );

        // -------------------------------------------------
        // Send to Student
        // -------------------------------------------------

        if (student.studentPhone) {
          console.log(`📤 Sending to student: ${student.name}`);
          await sendMessage(`${student.studentPhone}@c.us`, reportText);

          console.log(`⏳ Waiting ${DELAY_MS / 1000} seconds...`);
          await sleep(DELAY_MS);
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

          console.log(`⏳ Waiting ${DELAY_MS / 1000} seconds...`);
          await sleep(DELAY_MS);
        }

      } catch (err) {
        console.error(`❌ Error processing ${student.name}:`, err.message);
      }
    }

    console.log("🎉 Weekly reports finished successfully.");

  } catch (err) {
    console.error("❌ Weekly report job FAILED:", err.message);
  }
}

// ---------------------------------------------------------
// 🔹 Schedule Every Sunday 12:00 Cairo Time
// ---------------------------------------------------------

cron.schedule(
  "0 12 * * SUN",
  () => {
    console.log("🕛 Weekly scheduled job triggered!");
    sendWeeklyReports();
  },
  {
    scheduled: true,
    timezone: "Africa/Cairo"
  }
);

module.exports = { sendWeeklyReports };
