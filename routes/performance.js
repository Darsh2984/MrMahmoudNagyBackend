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

// ----------------- Helper: Resolve Teacher ID -----------------
async function resolveTeacherId(teacherId) {
  const user = await User.findById(teacherId);
  if (!user) return null;

  // If this is an assistant, return the main teacher’s ID
  if (user.assistantOf) {
    return user.assistantOf;
  }
  return user._id; // main teacher
}

// ----------------- Export Group Performance -----------------
router.get("/export/:groupId/teacher/:teacherId", async (req, res) => {
  try {
    let { groupId, teacherId } = req.params;

    teacherId = await resolveTeacherId(teacherId);
    if (!teacherId) {
      return res.status(404).json({ msg: "❌ Teacher not found" });
    }

    // 1. Fetch this group with students
    const group = await Group.findById(groupId)
      .populate({
        path: "students",
        populate: { path: "parentId", select: "name parentPhone" },
      });
    if (!group) {
      return res.status(404).json({ msg: "❌ Group not found" });
    }

    // 2. Get tasks & quizzes for this group
    const tasks = await Task.find({ groups: groupId, teacherId });
    const quizzes = await Quiz.find({ groups: groupId, teacherId });
    const sessions = await Session.find({ groupId, teacherId });

    // 3. Create workbook
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet(`${group.name} Performance`);

    // 4. Columns (dynamic task + quiz names)
    worksheet.columns = [
      { header: "Student Name", key: "studentName", width: 25 },
      { header: "Student Number", key: "studentPhone", width: 20 },
      { header: "Parent Name", key: "parentName", width: 25 },
      { header: "Parent Phone", key: "parentPhone", width: 20 },
      { header: "Attendance %", key: "attendance", width: 15 },
      ...tasks.map((t) => ({
        header: `Task: ${t.title}`,
        key: `task_${t._id}`,
        width: 25,
      })),
      ...quizzes.map((q) => ({
        header: `Quiz: ${q.title}`,
        key: `quiz_${q._id}`,
        width: 20,
      })),
    ];

    // 5. Add rows for each student
    for (const student of group.students) {
      // Attendance %
      const attended = sessions.filter((s) =>
        s.attendance.some(
          (a) =>
            a.studentId.toString() === student._id.toString() &&
            a.status === "Present"
        )
      ).length;
      const attendancePct =
        sessions.length > 0
          ? ((attended / sessions.length) * 100).toFixed(1) + "%"
          : "N/A";

      const row = {
        studentName: student.name,
        studentPhone: student.studentPhone || "N/A",
        parentName: student.parentId?.name || student.parentName || "N/A",
        parentPhone: student.parentId?.parentPhone || student.parentPhone || "N/A",
        attendance: attendancePct,
      };

      // Task submissions
      for (const t of tasks) {
        const submission = await Submission.findOne({
          studentId: student._id,
          taskId: t._id,
        });
        row[`task_${t._id}`] = submission ? "✅ Submitted" : "❌ Not Submitted";
      }

      // Quiz submissions
      for (const q of quizzes) {
        const submission = await QuizSubmission.findOne({
          studentId: student._id,
          quizId: q._id,
        });
        row[`quiz_${q._id}`] =
          submission && submission.score !== null
            ? `${submission.score}/${q.questions.length}`
            : "❌ Not Attempted";
      }

      worksheet.addRow(row);
    }

    // 6. Style header
    worksheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
    worksheet.getRow(1).fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FF0B3C49" },
    };

    // 7. Send Excel
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    res.setHeader(
      "Content-Disposition",
      `attachment; filename=${group.name}_performance.xlsx`
    );

    await workbook.xlsx.write(res);
    res.end();
  } catch (err) {
    console.error("❌ Error exporting group performance:", err);
    res
      .status(500)
      .json({ msg: "❌ Failed to export group performance", error: err.message });
  }
});


// ----------------- Get Student Performance for teacher -----------------
router.get("/:groupId/:studentId/teacher/:teacherId", async (req, res) => {
  try {
    let { groupId, studentId, teacherId } = req.params;

    if (!groupId || groupId === "null") {
      return res.status(400).json({ msg: "❌ Student is not assigned to a group" });
    }

    teacherId = await resolveTeacherId(teacherId);
    if (!teacherId) {
      return res.status(404).json({ msg: "❌ Teacher not found" });
    }

    // Attendance
    const sessions = await Session.find({ groupId, teacherId }).populate("attendance.studentId");
    const attendance = sessions.map((s) => {
      const studentAttendance = s.attendance.find(
        (a) => a.studentId && a.studentId._id.toString() === studentId
      );
      return {
        date: s.createdAt,
        title: s.title,
        present: studentAttendance?.status === "Present",
      };
    });

    // Tasks
    const tasks = await Task.find({ groups: groupId, teacherId });
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
    const quizzes = await Quiz.find({ groups: groupId, teacherId }).populate("questions");
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
        score: submission ? submission.score : null,
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

// ✅ Student Performance (no need to pass teacherId from frontend) for student call
router.get("/student/:studentId", async (req, res) => {
  try {
    const { studentId } = req.params;

    // 1. Find the student and their group
    const student = await User.findById(studentId)
      .populate("groupId")
      .populate("yearId");
    if (!student || !student.groupId) {
      return res.status(400).json({ msg: "❌ Student not assigned to a group" });
    }

    const groupId = student.groupId._id;

    // 2. Resolve teacherId
    let teacherId = null;

    // If Group model has teacherId
    if (student.groupId.teacherId) {
      teacherId = student.groupId.teacherId;
    }

    // Fallback → use year’s teacherId (if stored there)
    if (!teacherId && student.yearId?.teacherId) {
      teacherId = student.yearId.teacherId;
    }

    // Last fallback → use realTeacherId (from login assignment)
    if (!teacherId && student.realTeacherId) {
      teacherId = student.realTeacherId;
    }

    if (!teacherId) {
      return res.status(404).json({ msg: "❌ Could not resolve teacher for this student" });
    }

    // 3. Attendance
    const sessions = await Session.find({ groupId, teacherId }).populate("attendance.studentId");
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

    // 4. Tasks
    const tasks = await Task.find({ groups: groupId, teacherId });
    const submissions = await Submission.find({
      studentId,
      taskId: { $in: tasks.map((t) => t._id) },
    });
    const taskStatus = tasks.map((t) => ({
      _id: t._id,
      title: t.title,
      submitted: submissions.some((s) => s.taskId.toString() === t._id.toString()),
    }));

    // 5. Quizzes
    const quizzes = await Quiz.find({ groups: groupId, teacherId }).populate("questions");
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
        score: submission ? submission.score : null,
        total: q.questions.length,
      };
    });

    // ✅ Final response
    res.json({
      attendance,
      tasks: taskStatus,
      quizzes: quizGrades,
    });
  } catch (err) {
    console.error("❌ Error fetching student performance:", err);
    res.status(500).json({ msg: "❌ Failed to fetch performance", error: err.message });
  }
});

// ✅ Parent → Fetch performance for all children
router.get("/parent/:parentId", async (req, res) => {
  try {
    const { parentId } = req.params;

    // 1. Find parent with children
    const parent = await User.findById(parentId)
      .populate("children")
      .populate({
        path: "children",
        populate: [{ path: "groupId" }, { path: "yearId" }],
      });

    if (!parent || parent.role !== "parent") {
      return res.status(404).json({ msg: "❌ Parent not found" });
    }

    // 2. For each child, reuse the student performance logic
    const childrenPerformance = await Promise.all(
      parent.children.map(async (child) => {
        if (!child.groupId) {
          return {
            childId: child._id,
            childName: child.name,
            msg: "❌ Not assigned to a group",
          };
        }

        const groupId = child.groupId._id;

        // 🔹 Resolve teacherId (same as student route)
        let teacherId = null;
        if (child.groupId.teacherId) {
          teacherId = child.groupId.teacherId;
        }
        if (!teacherId && child.yearId?.teacherId) {
          teacherId = child.yearId.teacherId;
        }
        if (!teacherId && child.realTeacherId) {
          teacherId = child.realTeacherId;
        }

        if (!teacherId) {
          return {
            childId: child._id,
            childName: child.name,
            msg: "❌ Could not resolve teacher for this student",
          };
        }

        // Attendance
        const sessions = await Session.find({ groupId, teacherId }).populate("attendance.studentId");
        const attendance = sessions.map((s) => {
          const studentAttendance = s.attendance.find(
            (a) => a.studentId._id.toString() === child._id.toString()
          );
          return {
            date: s.createdAt,
            title: s.title,
            present: studentAttendance?.status === "Present",
          };
        });

        // Tasks
        const tasks = await Task.find({ groups: groupId, teacherId });
        const submissions = await Submission.find({
          studentId: child._id,
          taskId: { $in: tasks.map((t) => t._id) },
        });
        const taskStatus = tasks.map((t) => ({
          _id: t._id,
          title: t.title,
          submitted: submissions.some(
            (s) => s.taskId.toString() === t._id.toString()
          ),
        }));

        // Quizzes
        const quizzes = await Quiz.find({ groups: groupId, teacherId }).populate("questions");
        const quizSubmissions = await QuizSubmission.find({
          studentId: child._id,
          quizId: { $in: quizzes.map((q) => q._id) },
        }).populate("quizId", "title");

        const quizGrades = quizzes.map((q) => {
          const submission = quizSubmissions.find(
            (s) => s.quizId._id.toString() === q._id.toString()
          );
          return {
            quizTitle: q.title,
            score: submission ? submission.score : null,
            total: q.questions.length,
          };
        });

        return {
          childId: child._id,
          childName: child.name,
          attendance,
          tasks: taskStatus,
          quizzes: quizGrades,
        };
      })
    );

    res.json(childrenPerformance);
  } catch (err) {
    console.error("❌ Error fetching parent performance:", err);
    res
      .status(500)
      .json({ msg: "❌ Failed to fetch parent performance", error: err.message });
  }
});



module.exports = router;
