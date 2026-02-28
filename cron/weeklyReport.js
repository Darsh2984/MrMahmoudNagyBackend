// cron/weeklyReport.js
// ✅ Production Weekly Report Sender
// ✅ Runs automatically every Sunday at 12 PM
// ✅ Sends to ALL students
// ✅ Randomized message structure
// ✅ Random delay 1–5 minutes between each student
// ✅ Safe sequential sending

const cron = require("node-cron");
const axios = require("axios");
const { sendMessage } = require("../utils/wapilot");

const User = require("../models/User");
const Task = require("../models/Task");
const QuizSubmission = require("../models/QuizSubmission");
const Submission = require("../models/Submission");
const Session = require("../models/Session");

const BASE_URL = process.env.BASE_URL || "http://localhost:5000";

// ---------------------------------------------------------
// Helpers
// ---------------------------------------------------------

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Random delay 1–5 minutes (anti-restriction safety)
function getRandomDelay() {
  const min = 60000; // 1 min
  const max = 300000; // 5 min
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function pickRandom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function shuffleArray(array) {
  return array.sort(() => Math.random() - 0.5);
}

// Automatically build last 7 days window
function buildWindow() {
  const now = new Date();
  const toDate = new Date(now.setHours(23, 59, 59, 999));
  const fromDate = new Date();
  fromDate.setDate(toDate.getDate() - 7);
  fromDate.setHours(0, 0, 0, 0);
  return { fromDate, toDate };
}

// ---------------------------------------------------------
// Message Builder (Highly Customizable)
// ---------------------------------------------------------

function formatPerformanceReport(name, performance, fromDate, toDate) {
  const totalSessions = performance.attendance.length;
  const presents = performance.attendance.filter((a) => a.present).length;
  const absents = totalSessions - presents;

  const attendanceRate = totalSessions
    ? Math.round((presents / totalSessions) * 100)
    : 0;

  const greetingOptions = [
    `Hello ${name} 👋`,
    `Hi ${name},`,
    `Dear ${name},`,
    `Good day ${name} 😊`,
    `${name}, here is your weekly update 👇`,
  ];

  const closingOptions = [
    "Keep pushing forward 💪",
    "Consistency builds success 🚀",
    "Let’s aim even higher next week 📈",
    "Proud of your effort — stay focused 🔥",
    "Step by step progress 👍",
  ];

  const replyPrompts = [
    "Reply OK to confirm you received this report.",
    "If you have any questions, just reply here.",
    "Feel free to message me if you need clarification.",
    "Let me know if you need help with anything.",
    "Reply if you'd like to discuss your progress.",
  ];

  const attendanceInsight =
    attendanceRate >= 85
      ? "Excellent attendance record 👏"
      : attendanceRate >= 65
      ? "Attendance is acceptable but can improve."
      : "Attendance needs serious attention.";

  const tasksSection = performance.tasks.length
    ? performance.tasks
        .map((t) => `• ${t.title}: ${t.submitted ? "Submitted" : "Not Submitted"}`)
        .join("\n")
    : "No tasks due during this period.";

  const onlineQuizSection = performance.quizzes.length
    ? performance.quizzes
        .map((q) => `• ${q.quizTitle}: ${q.score}/${q.total}`)
        .join("\n")
    : "No online quizzes submitted in this period.";

  const inClassSection = performance.inClassQuizzes.length
    ? performance.inClassQuizzes
        .map(
          (q) =>
            `• ${q.quizName}: ${q.score}/${q.total} – ${q.percentage ?? "—"}% (${q.letterGrade ?? "—"})`
        )
        .join("\n")
    : "No in-class quizzes recorded.";

  // Randomize section order
  const sections = shuffleArray([
    `🟦 Attendance Summary\n• ${presents} Present\n• ${absents} Absent\n• Rate: ${attendanceRate}%\n${attendanceInsight}`,
    `🟩 Tasks Overview\n${tasksSection}`,
    `🟧 Online Quizzes\n${onlineQuizSection}`,
    `🟪 In-Class Quizzes\n${inClassSection}`,
  ]);

  return `
${pickRandom(greetingOptions)}

📘 Performance Summary
📅 ${fromDate.toDateString()} → ${toDate.toDateString()}

${sections.join("\n\n")}

——
${pickRandom(closingOptions)}

${pickRandom(replyPrompts)}
`.trim();
}

// ---------------------------------------------------------
// MAIN LOGIC
// ---------------------------------------------------------

async function sendWeeklyReports() {
  try {
    console.log("🚀 Starting Weekly Report Job...");

    const { fromDate, toDate } = buildWindow();

    const students = await User.find({ role: "student" }).populate("parentId");

    console.log(`👥 Total students: ${students.length}`);

    for (const student of students) {
      try {
        if (!student.groupId) continue;

        console.log(`\n📌 Processing: ${student.name}`);

        const groupId = student.groupId;

        // ---------------- Attendance ----------------
        const sessionsInWindow = await Session.find({
          groupId,
          date: { $gte: fromDate, $lte: toDate },
        });

        const attendance = sessionsInWindow.map((session) => {
          const studentAttendance = session.attendance.find(
            (a) => a.studentId.toString() === student._id.toString()
          );

          return {
            date: session.date,
            title: session.title,
            present: studentAttendance?.status === "Present",
          };
        });

        // ---------------- Tasks ----------------
        const tasksInWindow = await Task.find({
          groups: groupId,
          deadline: { $gte: fromDate, $lte: toDate },
        });

        const submissions = await Submission.find({
          studentId: student._id,
          taskId: { $in: tasksInWindow.map((t) => t._id) },
        });

        const tasks = tasksInWindow.map((t) => ({
          title: t.title,
          submitted: submissions.some(
            (s) => s.taskId.toString() === t._id.toString()
          ),
        }));

        // ---------------- Online Quizzes ----------------
        const submissionsInWindow = await QuizSubmission.find({
          studentId: student._id,
          submittedAt: { $gte: fromDate, $lte: toDate },
          isSubmitted: true,
        }).populate("quizId");

        const quizzes = submissionsInWindow.map((s) => ({
          quizTitle: s.quizId?.title ?? "Quiz",
          score: s.score,
          total: s.quizId?.questions?.length ?? 0,
        }));

        // ---------------- In-Class Quizzes (Optional API) ----------------
        let inClassQuizzes = [];
        try {
          const performanceRes = await axios.get(
            `${BASE_URL}/api/performance/student/${student._id}`
          );

          inClassQuizzes =
            performanceRes.data.inClassQuizzes?.filter((q) => {
              const quizDate = new Date(q.date);
              return quizDate >= fromDate && quizDate <= toDate;
            }) || [];
        } catch {
          // API optional — skip silently
        }

        const performance = {
          attendance,
          tasks,
          quizzes,
          inClassQuizzes,
        };

        const reportText = formatPerformanceReport(
          student.name,
          performance,
          fromDate,
          toDate
        );

        // Send to student
        if (student.phone) {
          await sendMessage(student.phone, reportText);
        }

        // Send to parent
        if (student.parentId?.phone) {
          await sendMessage(student.parentId.phone, reportText);
        }

        console.log("✅ Sent successfully");

        // 🔥 Random delay 1–5 minutes
        const delay = getRandomDelay();
        console.log(`⏳ Waiting ${Math.round(delay / 60000)} minutes...`);
        await sleep(delay);

      } catch (err) {
        console.log(`⚠️ Failed for ${student.name}:`, err.message);
      }
    }

    console.log("🏁 Weekly Report Job Completed.");
  } catch (err) {
    console.error("❌ Weekly Report Job Failed:", err.message);
  }
}

// ---------------------------------------------------------
// CRON SCHEDULE – Every Sunday at 12 PM
// ---------------------------------------------------------

cron.schedule("0 12 * * 0", async () => {
  console.log("🕛 Sunday 12PM Triggered");
  await sendWeeklyReports();
});

// Optional manual export
module.exports = { sendWeeklyReports };