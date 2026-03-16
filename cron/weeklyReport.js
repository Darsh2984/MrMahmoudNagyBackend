// cron/weeklyReport.js
// ✅ Structured Performance Report (Last 2 Weeks)
// ✅ Uses studentPhone & parentPhone correctly
// ✅ 1 minute per message
// ✅ 3 minutes every 10 messages
// ✅ TEST MODE supported
// ✅ Monday 5 PM Cairo

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
// CONFIG
// ---------------------------------------------------------

const GROUP_IDS = [
  // "690a1c2eb201f7703aef6646",
  // "68d01e89dbf36ce8d92d36c2",
  // "68eeb053109d336a913edc33",
  // "68f338dec334d2d6f3fe4770",
  // "68cdab54fe115dddbb55c008",
  // "68d7bf2ff11ff7f0d3f8de0c"
  
  "68cdab49fe115dddbb55c003",
  "68cdab76fe115dddbb55c00d",
  "68d02dbedbf36ce8d92d3704",
  "68d0341cdbf36ce8d92d3874",
  "68d181b1f499fc231effe7e3",
  "68d1a249742bba8c97f71070"
];

const MESSAGE_DELAY_MS = 60000;     // 1 minute
const BATCH_SIZE = 10;
const BATCH_DELAY_MS = 180000;      // 3 minutes

const TEST_MODE = false; // 🔥 set true to send to TEST_NUMBER only
const TEST_NUMBER = "+201099250572";

// ---------------------------------------------------------

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function buildWindow() {
  const now = new Date();
  const toDate = new Date(now.setHours(23, 59, 59, 999));
  const fromDate = new Date();
  fromDate.setDate(toDate.getDate() - 14);
  fromDate.setHours(0, 0, 0, 0);
  return { fromDate, toDate };
}

function logProgress(sent, total) {
  const remaining = total - sent;
  console.log(`   📊 Sent: ${sent} | Remaining: ${remaining} | Total: ${total}`);
}

// ---------------------------------------------------------
// REPORT BUILDER
// ---------------------------------------------------------

function formatReport(studentName, attendance, tasks, quizzes, inClass, fromDate, toDate) {
  const presents = attendance.filter(a => a.present).length;
  const absents = attendance.length - presents;

  const attendanceSection = `
🟦 Attendance
* ${presents} Present
* ${absents} Absent
`.trim();

  const tasksSection = tasks.length
    ? tasks.map(t => `* ${t.title} : ${t.submitted ? "Submitted" : "Not Submitted"}`).join("\n")
    : "No Tasks This Period";

  const onlineQuizSection = quizzes.length
    ? quizzes.map(q => `* ${q.quizTitle}: ${q.score ?? "null"}/${q.total ?? 0}`).join("\n")
    : "No Online Quiz Submissions This Period";

  const inClassSection = inClass.length
    ? inClass.map(q =>
        `* ${q.quizName}: ${q.score ?? "null"}/${q.total ?? 0} – ${q.percentage ?? "—"}% (${q.letterGrade ?? ""})`
      ).join("\n")
    : "No In-Class Quiz Records This Period";

  return `
📘 Performance Report (Last 2 Weeks) – ${studentName} with MR Mahmoud Nagy
📅 ${fromDate.toDateString()} → ${toDate.toDateString()}

${attendanceSection}

🟩 Tasks (By Deadline)
${tasksSection}

🟧 Online Quizzes (By Submission Date)
${onlineQuizSection}

🟪 In-Class Quizzes (By Quiz Date)
${inClassSection}

——
`.trim();
}

// ---------------------------------------------------------
// MAIN LOGIC
// ---------------------------------------------------------

async function sendWeeklyReports() {
  try {
    console.log("==========================================");
    console.log("🚀 Performance Report Job Started");
    console.log("==========================================");

    const { fromDate, toDate } = buildWindow();

    let students = [];
    for (const groupId of GROUP_IDS) {

      const groupStudents = await User.find({
        role: "student",
        groupId: groupId
      });

      students = students.concat(groupStudents);
    }

    const totalStudents = students.length;

    const totalExpectedMessages = TEST_MODE
      ? totalStudents
      : students.reduce((acc, s) => {
          if (s.studentPhone) acc++;
          if (s.parentPhone) acc++;
          return acc;
        }, 0);

    console.log(`👥 Total Students: ${totalStudents}`);
    console.log(`📨 Expected Messages: ${totalExpectedMessages}`);
    console.log(`🧪 TEST MODE: ${TEST_MODE ? "ON" : "OFF"}`);
    console.log("------------------------------------------");

    let messageCounter = 0;
    let successCounter = 0;
    let failureCounter = 0;

    for (let i = 0; i < students.length; i++) {
      const student = students[i];

      console.log(`\n📌 ${i + 1}/${totalStudents} → ${student.name}`);

      try {
        const groupId = student.groupId;

        // ---------------- Attendance ----------------
        const sessions = await Session.find({
          groupId,
          date: { $gte: fromDate, $lte: toDate },
        });

        const attendance = sessions.map(session => {
          const record = session.attendance.find(
            a => a.studentId.toString() === student._id.toString()
          );
          return { present: record?.status === "Present" };
        });

        // ---------------- Tasks ----------------
        const tasksInWindow = await Task.find({
          groups: groupId,
          deadline: { $gte: fromDate, $lte: toDate },
        });

        const submissions = await Submission.find({
          studentId: student._id,
          taskId: { $in: tasksInWindow.map(t => t._id) },
        });

        const tasks = tasksInWindow.map(t => ({
          title: t.title,
          submitted: submissions.some(
            s => s.taskId.toString() === t._id.toString()
          ),
        }));

        // ---------------- Online Quizzes ----------------
        const quizSubs = await QuizSubmission.find({
          studentId: student._id,
          submittedAt: { $gte: fromDate, $lte: toDate },
          isSubmitted: true,
        }).populate("quizId");

        const quizzes = quizSubs.map(s => ({
          quizTitle: s.quizId?.title ?? "Quiz",
          score: s.score,
          total: s.quizId?.questions?.length ?? 0,
        }));

        // ---------------- In-Class Quizzes ----------------
        let inClass = [];
        try {
          const res = await axios.get(
            `${BASE_URL}/api/performance/student/${student._id}`
          );

          inClass =
            res.data.inClassQuizzes?.filter(q => {
              const quizDate = new Date(q.date);
              return quizDate >= fromDate && quizDate <= toDate;
            }) || [];
        } catch {}

        const reportText = formatReport(
          student.name,
          attendance,
          tasks,
          quizzes,
          inClass,
          fromDate,
          toDate
        );

        // ================= SEND =================

        if (TEST_MODE) {
          await sendMessage(TEST_NUMBER, reportText);
          successCounter++;
          messageCounter++;
          console.log("   ✅ Sent TEST message");
          logProgress(messageCounter, totalExpectedMessages);
          await sleep(MESSAGE_DELAY_MS);

        } else {
          // ---- Student ----
          if (student.studentPhone) {
            await sendMessage(student.studentPhone, reportText);
            successCounter++;
            messageCounter++;
            console.log("   ✅ Sent to student");
            logProgress(messageCounter, totalExpectedMessages);
            await sleep(MESSAGE_DELAY_MS);
          }

          // ---- Parent ----
          if (student.parentPhone) {
            await sendMessage(student.parentPhone, reportText);
            successCounter++;
            messageCounter++;
            console.log("   ✅ Sent to parent");
            logProgress(messageCounter, totalExpectedMessages);
            await sleep(MESSAGE_DELAY_MS);
          }
        }

        // Batch delay
        if (messageCounter > 0 && messageCounter % BATCH_SIZE === 0) {
          console.log("⏳ Batch delay 3 minutes...");
          await sleep(BATCH_DELAY_MS);
        }

      } catch (err) {
        failureCounter++;
        console.log("❌ Student processing error:", err.message);
      }
    }

    console.log("\n==========================================");
    console.log("🏁 Job Completed");
    console.log(`📨 Attempted: ${messageCounter}`);
    console.log(`✅ Success: ${successCounter}`);
    console.log(`❌ Failed: ${failureCounter}`);
    console.log("==========================================");

  } catch (err) {
    console.error("❌ Job Failed:", err.message);
  }
}

// ---------------------------------------------------------
// CRON – Monday 5:00 PM Cairo
// ---------------------------------------------------------

cron.schedule(
  "30 15 * * 1",
  async () => {
    console.log("🕔 Monday 5:00PM Triggered (Africa/Cairo)");
    await sendWeeklyReports();
  },
  { timezone: "Africa/Cairo" }
);

module.exports = { sendWeeklyReports };