// const cron = require("node-cron");
// const Task = require("../models/Task");
// const Submission = require("../models/Submission");
// const User = require("../models/User");
// const { sendMessage } = require("../utils/wapilot");
// const transporter = require("../config/nodemailer");

// // Run every minute
// cron.schedule("* * * * *", async () => {
//   const now = new Date();
//   const oneMinuteAgo = new Date(now.getTime() - 60 * 1000);

//   console.log("⏰ Cron running, checking deadlines...");

//   // Find tasks where deadline passed within the last minute and not notified yet
//   const tasks = await Task.find({
//     deadline: { $lte: now, $gt: oneMinuteAgo },
//     notifiedDeadline: { $ne: true }
//   });

//   for (const task of tasks) {
//     console.log(`📢 Deadline just passed for task: ${task.title}`);

//     const students = await User.find({
//       role: "student",
//       groupId: { $in: task.groups }
//     })
//       .select("name email studentPhone parentPhone parentId")
//       .populate("parentId", "name email parentPhone");

//     for (const student of students) {
//       const submission = await Submission.findOne({
//         taskId: task._id,
//         studentId: student._id
//       });

//       const status = submission ? "✅ Submitted" : "❌ Not Submitted";

//       const msg = `📢 Task Deadline Passed
// Title: ${task.title}
// Deadline: ${task.deadline.toLocaleString("en-GB")}
// Status: ${status}`;

//       // --- Student WhatsApp ---
//       if (student.studentPhone) {
//         try {
//           await sendMessage(`${student.studentPhone}@c.us`, msg);
//           console.log(`✅ WhatsApp sent to student ${student.name}`);
//         } catch (err) {
//           console.warn(
//             `⚠️ Failed to send WhatsApp to student ${student.name}:`,
//             err.message
//           );
//         }
//       }

//       // --- Parent WhatsApp ---
//       const parentPhone = student.parentPhone || student.parentId?.parentPhone;
//       if (parentPhone) {
//         try {
//           await sendMessage(
//             `${parentPhone}@c.us`,
//             `📢 Your child ${student.name} → ${status} for task "${task.title}"`
//           );
//           console.log(`✅ WhatsApp sent to parent of ${student.name}`);
//         } catch (err) {
//           console.warn(
//             `⚠️ Failed to send WhatsApp to parent of ${student.name}:`,
//             err.message
//           );
//         }
//       }

//       // --- Student Email ---
//       if (student.email) {
//         try {
//           await transporter.sendMail({
//             to: student.email,
//             from: process.env.EMAIL_USER,
//             subject: `📢 Task Deadline Passed: ${task.title}`,
//             html: `<p>Hello ${student.name},</p>
//                    <p>Your task <b>${task.title}</b> deadline has passed.</p>
//                    <p>Status: <b>${status}</b></p>`
//           });
//           console.log(`✅ Email sent to student ${student.email}`);
//         } catch (err) {
//           console.warn(
//             `⚠️ Failed to send email to student ${student.email}:`,
//             err.message
//           );
//         }
//       }
//     }

//     // ✅ Mark task as fully notified so it won’t be picked up again
//     task.notifiedDeadline = true;
//     await task.save();
//   }
// });
