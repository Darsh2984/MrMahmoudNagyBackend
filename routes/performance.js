const express = require("express");
const router = express.Router();
const ExcelJS = require("exceljs");

const Session = require("../models/Session");
const Task = require("../models/Task");
const Submission = require("../models/Submission");
const Quiz = require("../models/Quiz");
const QuizSubmission = require("../models/QuizSubmission");
const Group = require("../models/Group");
const User = require("../models/User");

router.get("/export/:yearId", async (req, res) => {
  try {
    const { yearId } = req.params;

    // 1. Fetch all groups in this year
    const groups = await Group.find({ yearId }).populate("students");

    // 2. Create Excel workbook
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet("Performance");

    worksheet.columns = [
      { header: "Student Name", key: "studentName", width: 25 },
      { header: "Group", key: "group", width: 20 },
      { header: "Attendance %", key: "attendance", width: 15 },
      { header: "Tasks Submitted", key: "tasks", width: 20 },
      { header: "Quizzes Avg", key: "quizzes", width: 20 },
    ];

    // 3. Loop through each group & student
    for (const g of groups) {
      for (const student of g.students) {
        // Attendance
        const sessions = await Session.find({ groupId: g._id });
        const attended = sessions.filter((s) =>
          s.attendance.some(
            (a) => a.studentId.toString() === student._id.toString() && a.status === "Present"
          )
        ).length;
        const attendancePct =
          sessions.length > 0 ? ((attended / sessions.length) * 100).toFixed(1) + "%" : "N/A";

        // Tasks
        const tasks = await Task.find({ groups: g._id });
        const submissions = await Submission.find({
          studentId: student._id,
          taskId: { $in: tasks.map((t) => t._id) },
        });
        const taskStatus = `${submissions.length}/${tasks.length}`;

        // Quizzes
        const quizzes = await Quiz.find({ groups: g._id });
        const quizSubs = await QuizSubmission.find({
          studentId: student._id,
          quizId: { $in: quizzes.map((q) => q._id) },
        });
        let avgQuiz = "N/A";
        if (quizSubs.length > 0) {
          const totalScore = quizSubs.reduce((sum, qs) => sum + (qs.score || 0), 0);
          const totalMax = quizzes.reduce((sum, q) => sum + q.questions.length, 0);
          avgQuiz = totalMax > 0 ? `${(totalScore / totalMax * 100).toFixed(1)}%` : "N/A";
        }

        worksheet.addRow({
          studentName: student.name,
          group: g.name,
          attendance: attendancePct,
          tasks: taskStatus,
          quizzes: avgQuiz,
        });
      }
    }

    // Style header
    worksheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
    worksheet.getRow(1).fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FF0B3C49" }, // deep teal
    };

    // Send Excel file
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    res.setHeader("Content-Disposition", "attachment; filename=year_performance.xlsx");

    await workbook.xlsx.write(res);
    res.end();
  } catch (err) {
    console.error("❌ Error exporting year performance:", err);
    res.status(500).json({ msg: "❌ Failed to export performance", error: err.message });
  }
});

// Get full performance of a student inside a group
router.get("/:groupId/:studentId", async (req, res) => {
  try {
    const { groupId, studentId } = req.params;

    if (!groupId || groupId === "null") {
      return res.status(400).json({ msg: "❌ Student is not assigned to a group" });
    }

    // Attendance
    const sessions = await Session.find({ groupId }).populate("attendance.studentId");
    const attendance = sessions.map((s) => {
      const studentAttendance = s.attendance.find(
        (a) => a.studentId._id.toString() === studentId
      );
      return {
        date: s.createdAt,
        title: s.title,
        present: studentAttendance?.status === "Present",
      };
    });

    // Tasks
    const tasks = await Task.find({ groups: groupId });
    const submissions = await Submission.find({
      studentId,
      taskId: { $in: tasks.map((t) => t._id) },
    });
    const taskStatus = tasks.map((t) => ({
      _id: t._id,
      title: t.title,
      submitted: submissions.some((s) => s.taskId.toString() === t._id.toString()),
    }));

    // Quizzes
    const quizzes = await Quiz.find({ groups: groupId }).populate("questions");
    const quizSubmissions = await QuizSubmission.find({
      studentId,
      quizId: { $in: quizzes.map((q) => q._id) },
    }).populate("quizId", "title");

    const quizGrades = quizzes.map((q) => {
      const submission = quizSubmissions.find(
        (s) => s.quizId._id.toString() === q._id.toString()
      );
      return {
        quizTitle: q.title,
        score: submission ? submission.score : null, // adjust field if needed
        total: q.questions.length,
      };
    });

    res.json({
      attendance,
      tasks: taskStatus,
      quizzes: quizGrades,
    });
  } catch (err) {
    console.error("❌ Error fetching performance:", err);
    res.status(500).json({ msg: "❌ Failed to fetch performance", error: err.message });
  }
});

module.exports = router;
