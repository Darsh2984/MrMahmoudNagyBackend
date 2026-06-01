// // cron/weeklyReport.js

// const cron = require("node-cron");
// const axios = require("axios");
// const { sendMessage } = require("../utils/wapilot");

// const User = require("../models/User");
// const Task = require("../models/Task");
// const QuizSubmission = require("../models/QuizSubmission");
// const Submission = require("../models/Submission");
// const Session = require("../models/Session");

// const BASE_URL = process.env.BASE_URL || "http://localhost:5000";

// // ---------------------------------------------------------
// // CONFIG
// // ---------------------------------------------------------

// const GROUP_IDS = [
//   //  "68eeb053109d336a913edc33",
//   //  "68f338dec334d2d6f3fe4770",
//    "68d01e89dbf36ce8d92d36c2"
// ];

// const MESSAGE_DELAY_MS = 0;
// const BATCH_SIZE = 20;
// const BATCH_DELAY_MS = 180000;

// const GROUP_DELAY_MS = 1800000; // ⭐ 30 minutes

// const TEST_MODE = false;
// const TEST_NUMBER = "+201099250572";

// // ---------------------------------------------------------

// function sleep(ms) {
//   return new Promise(resolve => setTimeout(resolve, ms));
// }

// function buildWindow() {
//   const now = new Date();
//   const toDate = new Date(now.setHours(23, 59, 59, 999));
//   const fromDate = new Date();
//   fromDate.setDate(toDate.getDate() - 20);
//   fromDate.setHours(0, 0, 0, 0);
//   return { fromDate, toDate };
// }

// function logProgress(sent) {
//   console.log(`   📊 Total Messages Sent So Far: ${sent}`);
// }

// // ---------------------------------------------------------
// // REPORT BUILDER
// // ---------------------------------------------------------

// function formatReport(studentName, attendance, tasks, quizzes, inClass, fromDate, toDate) {

//   const presents = attendance.filter(a => a.present).length;
//   const absents = attendance.length - presents;

//   const attendanceSection = `
// 🟦 Attendance
// * ${presents} Present
// * ${absents} Absent
// `.trim();

//   const tasksSection = tasks.length
//     ? tasks.map(t => `* ${t.title} : ${t.submitted ? "Submitted" : "Not Submitted"}`).join("\n")
//     : "No Tasks This Period";

//   const onlineQuizSection = quizzes.length
//     ? quizzes.map(q => `* ${q.quizTitle}: ${q.score ?? "null"}/${q.total ?? 0}`).join("\n")
//     : "No Online Quiz Submissions This Period";

//   const inClassSection = inClass.length
//     ? inClass.map(q =>
//         `* ${q.quizName}: ${q.score ?? "null"}/${q.total ?? 0} – ${q.percentage ?? "—"}% (${q.letterGrade ?? ""})`
//       ).join("\n")
//     : "No In-Class Quiz Records This Period";

//   return `
// 📘 Performance Report (Last 2 Weeks) – ${studentName} with MR Mahmoud Nagy
// 📅 ${fromDate.toDateString()} → ${toDate.toDateString()}

// ${attendanceSection}

// 🟩 Tasks
// ${tasksSection}

// 🟧 Online Quizzes
// ${onlineQuizSection}

// 🟪 In-Class Quizzes
// ${inClassSection}

// ——
// `.trim();
// }

// // ---------------------------------------------------------
// // MAIN LOGIC
// // ---------------------------------------------------------

// async function sendWeeklyReports() {

//   console.log("🚀 Performance Report Job Started");

//   const { fromDate, toDate } = buildWindow();

//   let messageCounter = 0;
//   let successCounter = 0;
//   let failureCounter = 0;

//   for (let g = 0; g < GROUP_IDS.length; g++) {

//     const groupId = GROUP_IDS[g];

//     console.log("\n====================================");
//     console.log(`📚 Starting Group ${g + 1}/${GROUP_IDS.length}`);
//     console.log("====================================");

//     const students = await User.find({
//       role: "student",
//       groupId: groupId
//     });

//     console.log(`👥 Students in group: ${students.length}`);

//     for (let i = 0; i < students.length; i++) {

//       const student = students[i];

//       console.log(`\n📌 ${i + 1}/${students.length} → ${student.name}`);

//       try {

//         // -------- Attendance --------

//         const sessions = await Session.find({
//           groupId,
//           date: { $gte: fromDate, $lte: toDate },
//         });

//         const attendance = sessions.map(session => {
//           const record = session.attendance.find(
//             a => a.studentId.toString() === student._id.toString()
//           );
//           return { present: record?.status === "Present" };
//         });

//         // -------- Tasks --------

//         const tasksInWindow = await Task.find({
//           groups: groupId,
//           deadline: { $gte: fromDate, $lte: toDate },
//         });

//         const submissions = await Submission.find({
//           studentId: student._id,
//           taskId: { $in: tasksInWindow.map(t => t._id) },
//         });

//         const tasks = tasksInWindow.map(t => ({
//           title: t.title,
//           submitted: submissions.some(
//             s => s.taskId.toString() === t._id.toString()
//           ),
//         }));

//         // -------- Online Quizzes --------

//         const quizSubs = await QuizSubmission.find({
//           studentId: student._id,
//           submittedAt: { $gte: fromDate, $lte: toDate },
//           isSubmitted: true,
//         }).populate("quizId");

//         const quizzes = quizSubs.map(s => ({
//           quizTitle: s.quizId?.title ?? "Quiz",
//           score: s.score,
//           total: s.quizId?.questions?.length ?? 0,
//         }));

//         // -------- In Class --------

//         let inClass = [];
//         try {
//           const res = await axios.get(
//             `${BASE_URL}/api/performance/student/${student._id}`
//           );

//           inClass =
//             res.data.inClassQuizzes?.filter(q => {
//               const quizDate = new Date(q.date);
//               return quizDate >= fromDate && quizDate <= toDate;
//             }) || [];

//         } catch {}

//         const reportText = formatReport(
//           student.name,
//           attendance,
//           tasks,
//           quizzes,
//           inClass,
//           fromDate,
//           toDate
//         );

//         // -------- SEND --------

//         if (TEST_MODE) {

//           await sendMessage(TEST_NUMBER, reportText);
//           messageCounter++;
//           successCounter++;

//           console.log("   ✅ Sent TEST");

//           await sleep(MESSAGE_DELAY_MS);

//         } else {

//           if (student.studentPhone) {
//             await sendMessage(student.studentPhone, reportText);
//             messageCounter++;
//             successCounter++;

//             console.log("   ✅ Sent to student");

//             await sleep(MESSAGE_DELAY_MS);
//           }

//           if (student.parentPhone) {
//             await sendMessage(student.parentPhone, reportText);
//             messageCounter++;
//             successCounter++;

//             console.log("   ✅ Sent to parent");

//             await sleep(MESSAGE_DELAY_MS);
//           }
//         }

//         logProgress(messageCounter);

//         if (messageCounter > 0 && messageCounter % BATCH_SIZE === 0) {
//           console.log("⏳ Batch delay 3 minutes...");
//           await sleep(BATCH_DELAY_MS);
//         }

//       } catch (err) {
//         failureCounter++;
//         console.log("❌ Student error:", err.message);
//       }
//     }

//     // ⭐ GROUP DELAY
//     if (g < GROUP_IDS.length - 1) {
//       console.log("🛑 Finished Group → Waiting 30 minutes before next group...");
//       await sleep(GROUP_DELAY_MS);
//     }
//   }

//   console.log("\n🏁 Job Finished");
//   console.log("Messages:", messageCounter);
//   console.log("Success:", successCounter);
//   console.log("Failures:", failureCounter);
// }

// // ---------------------------------------------------------
// // CRON
// // ---------------------------------------------------------

// cron.schedule(
//   "30 15 * * 1",
//   async () => {
//     console.log("🕔 Monday Trigger");
//     await sendWeeklyReports();
//   },
//   { timezone: "Africa/Cairo" }
// );

// module.exports = { sendWeeklyReports };