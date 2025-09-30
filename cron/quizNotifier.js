// const cron = require("node-cron");
// const Quiz = require("../models/Quiz");
// const User = require("../models/User");
// const { sendMessage } = require("../utils/wapilot");

// cron.schedule("* * * * *", async () => {
//   const now = new Date();
//   const oneMinuteAgo = new Date(now.getTime() - 60 * 1000);

//   const quizzes = await Quiz.find({
//     startTime: { $lte: now, $gt: oneMinuteAgo },
//     startNotified: { $ne: true }
//   });

//   for (const quiz of quizzes) {
//     console.log(`📢 Quiz opening now: ${quiz.title}`);

//     const students = await User.find({ role: "student", groupId: { $in: quiz.groups } })
//       .select("name studentPhone parentPhone parentId")
//       .populate("parentId", "name parentPhone");

//     for (const student of students) {
//       const msg = `📝 Quiz Now Open!\n\nTitle: ${quiz.title}\nDuration: ${quiz.duration} mins\nGood luck!`;

//       // WhatsApp student
//       if (student.studentPhone) {
//         await sendMessage(`${student.studentPhone}@c.us`, msg);
//       }

//       // WhatsApp parent
//       const parentPhone = student.parentPhone || student.parentId?.parentPhone;
//       if (parentPhone) {
//         await sendMessage(`${parentPhone}@c.us`, `📢 Quiz for your child ${student.name} is now open.\n\nTitle: ${quiz.title}`);
//       }
//     }

//     quiz.startNotified = true;
//     await quiz.save();
//   }
// });
