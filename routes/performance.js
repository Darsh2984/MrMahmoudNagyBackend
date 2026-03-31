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
const InClassQuiz = require("../models/InClassQuiz");


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
    if (!teacherId) return res.status(404).json({ msg: "❌ Teacher not found" });

    // 1. Fetch group + assistants in parallel
    const [group, assistantDocs] = await Promise.all([
      Group.findById(groupId).populate({
        path: "students",
        populate: { path: "parentId", select: "name parentPhone" },
      }),
      User.find({ assistantOf: teacherId }).select("_id"),
    ]);

    if (!group) return res.status(404).json({ msg: "❌ Group not found" });

    const assistantIds = assistantDocs.map((a) => a._id.toString());
    const teacherFilter = [
      { teacherId },
      { teacherId: req.params.teacherId },
      { teacherId: { $in: assistantIds } },
    ];

    const studentIds = group.students.map((s) => s._id);

    // 2. Fetch everything in parallel — including ALL submissions at once
    const [tasks, quizzes, sessions, inClassQuizzes, allTaskSubs, allQuizSubs] =
      await Promise.all([
        Task.find({ groups: groupId, $or: teacherFilter }),
        Quiz.find({ groups: groupId, $or: teacherFilter }),
        Session.find({ groupId, $or: teacherFilter }).sort({ createdAt: 1 }),
        InClassQuiz.find({ groupId, $or: teacherFilter }).sort({ date: 1 }),

        // ✅ Fetch ALL submissions for ALL students at once — no loop needed
        Submission.find({
          studentId: { $in: studentIds },
          taskId: { $in: [] }, // filled below after tasks load — see note
        }),
        QuizSubmission.find({
          studentId: { $in: studentIds },
          quizId: { $in: [] }, // filled below
        }),
      ]);

    // NOTE: Since tasks/quizzes aren't available before Promise.all resolves,
    // fetch submissions right after in one batch each:
    const [taskSubs, quizSubs] = await Promise.all([
      Submission.find({
        studentId: { $in: studentIds },
        taskId: { $in: tasks.map((t) => t._id) },
      }),
      QuizSubmission.find({
        studentId: { $in: studentIds },
        quizId: { $in: quizzes.map((q) => q._id) },
      }),
    ]);

    // 3. Build O(1) lookup maps — avoids scanning arrays inside loops
    // "studentId_taskId" → true
    const taskSubMap = new Set(
      taskSubs.map((s) => `${s.studentId}_${s.taskId}`)
    );

    // "studentId_quizId" → { score, total }
    const quizSubMap = new Map(
      quizSubs.map((s) => [`${s.studentId}_${s.quizId}`, s])
    );

    // 4. Build workbook
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet(`${group.name} Performance`);

    worksheet.columns = [
      { header: "Student Name",   key: "studentName",  width: 25 },
      { header: "Student Number", key: "studentPhone", width: 20 },
      { header: "Parent Name",    key: "parentName",   width: 25 },
      { header: "Parent Phone",   key: "parentPhone",  width: 20 },
      ...sessions.map((s) => ({
        header: `Session: ${s.title || new Date(s.createdAt).toLocaleDateString()}`,
        key: `session_${s._id}`,
        width: 18,
      })),
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
      ...inClassQuizzes.map((iq) => ({
        header: `In-Class Quiz: ${iq.quizName}`,
        key: `inclass_${iq._id}`,
        width: 20,
      })),
    ];

    // 5. Add rows — ZERO extra DB queries here now
    for (const student of group.students) {
      const sid = student._id.toString();

      const row = {
        studentName:  student.name,
        studentPhone: student.studentPhone || "N/A",
        parentName:   student.parentId?.name || student.parentName || "N/A",
        parentPhone:  student.parentId?.parentPhone || student.parentPhone || "N/A",
      };

      // Attendance — already embedded in session docs
      for (const s of sessions) {
        const found = s.attendance?.find((a) => a.studentId?.toString() === sid);
        row[`session_${s._id}`] = found?.status === "Present" ? "Present" : "Absent";
      }

      // Tasks — O(1) set lookup
      for (const t of tasks) {
        row[`task_${t._id}`] = taskSubMap.has(`${sid}_${t._id}`)
          ? "✅ Submitted"
          : "❌ Not Submitted";
      }

      // Quizzes — O(1) map lookup
      for (const q of quizzes) {
        const sub = quizSubMap.get(`${sid}_${q._id}`);
        row[`quiz_${q._id}`] =
          sub?.score != null
            ? `${sub.score}/${q.questions?.length ?? "?"}`
            : "❌ Not Attempted";
      }

      // In-Class Quizzes — already embedded in iq.studentGrades
      for (const iq of inClassQuizzes) {
        const grade = iq.studentGrades?.find((g) => g.studentId?.toString() === sid);
        row[`inclass_${iq._id}`] = grade
          ? `${grade.grade ?? 0}/${iq.gradeOutOf}`
          : "❌ Not Attempted";
      }

      worksheet.addRow(row);
    }

    // 6. Style header row
    const headerRow = worksheet.getRow(1);
    headerRow.font = { bold: true, color: { argb: "FFFFFFFF" } };
    headerRow.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FF0B3C49" },
    };

    // 7. Stream response
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
    console.error("❌ Export error:", err);
    res.status(500).json({ msg: "❌ Failed to export", error: err.message });
  }
});


// ----------------- Get Student Performance for teacher -----------------
router.get("/:groupId/:studentId/teacher/:teacherId", async (req, res) => {
  try {
    let { groupId, studentId, teacherId } = req.params;

    if (!groupId || groupId === "null")
      return res.status(400).json({ msg: "❌ Student is not assigned to a group" });

    // Resolve teacher + assistants in parallel
    const [resolvedId, assistantDocs] = await Promise.all([
      resolveTeacherId(teacherId),
      User.find({ assistantOf: teacherId }).select("_id"),
    ]);
    teacherId = resolvedId;
    if (!teacherId) return res.status(404).json({ msg: "❌ Teacher not found" });

    const assistantIds = assistantDocs.map((a) => a._id);

    // ✅ All 4 main queries fire at the same time
    const [sessions, tasks, quizzes, inClassQuizzes] = await Promise.all([
      // ✅ No populate — just fetch attendance array as-is (it stores studentId as ObjectId)
      Session.find({ groupId, teacherId }).select("title createdAt attendance"),

      Task.find({ groups: groupId, teacherId }).select("_id title"),

      Quiz.find({ groups: groupId, teacherId })
        .select("_id title questions")
        .populate("questions", "_id"), // only need count

      InClassQuiz.find({
        groupId,
        teacherId: { $in: [teacherId, ...assistantIds] },
      }).select("quizName gradeOutOf date studentGrades"),
    ]);

    const taskIds   = tasks.map((t) => t._id);
    const quizIds   = quizzes.map((q) => q._id);

    // ✅ Both submission queries fire in parallel
    const [submissions, quizSubmissions] = await Promise.all([
      Submission.find({ studentId, taskId: { $in: taskIds } }).select("taskId"),
      QuizSubmission.find({ studentId, quizId: { $in: quizIds } }).select("quizId score"),
    ]);

    // Build lookup sets/maps
    const submittedTaskIds = new Set(submissions.map((s) => s.taskId.toString()));
    const quizScoreMap = new Map(
      quizSubmissions.map((s) => [s.quizId.toString(), s.score])
    );

    // Shape responses
    const attendance = sessions.map((s) => {
      const record = s.attendance?.find(
        (a) => a.studentId?.toString() === studentId
      );
      return {
        date:    s.createdAt,
        title:   s.title,
        present: record?.status === "Present",
      };
    });

    const taskStatus = tasks.map((t) => ({
      _id:       t._id,
      title:     t.title,
      submitted: submittedTaskIds.has(t._id.toString()),
    }));

    const quizGrades = quizzes.map((q) => {
      const score = quizScoreMap.get(q._id.toString());
      return {
        quizTitle: q.title,
        score:     score ?? null,
        total:     q.questions.length,
      };
    });

    const inClassGrades = inClassQuizzes.map((iq) => {
      const g = iq.studentGrades?.find(
        (g) => g.studentId?.toString() === studentId
      );
      return {
        quizName:    iq.quizName,
        score:       g?.grade ?? null,
        total:       iq.gradeOutOf,
        date:        iq.date,
        percentage:  g?.percentage ?? null,
        letterGrade: g?.letterGrade ?? null,
      };
    });

    res.json({
      attendance,
      tasks:          taskStatus,
      quizzes:        quizGrades,
      inClassQuizzes: inClassGrades,
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
    if (student.groupId.teacherId) teacherId = student.groupId.teacherId;
    if (!teacherId && student.yearId?.teacherId) teacherId = student.yearId.teacherId;
    if (!teacherId && student.realTeacherId) teacherId = student.realTeacherId;

    if (!teacherId) {
      return res.status(404).json({ msg: "❌ Could not resolve teacher for this student" });
    }

    // 🔹 Fetch assistants of this teacher
    const assistants = await User.find({ assistantOf: teacherId }).select("_id");
    const assistantIds = assistants.map(a => a._id);

    // 3. Attendance
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

    // 6. In-Class Quizzes (include assistant-created)
    const inClassQuizzes = await InClassQuiz.find({
      groupId,
      teacherId: { $in: [teacherId, ...assistantIds] },
    }).populate("studentGrades.studentId", "name");

    const inClassGrades = inClassQuizzes.map((iq) => {
      const studentGrade = iq.studentGrades.find((g) => {
        const id =
          typeof g.studentId === "object"
            ? g.studentId?._id?.toString()
            : g.studentId?.toString();
        return id === studentId;
      });

      return {
        quizName: iq.quizName,
        score: studentGrade?.grade ?? null,
        total: iq.gradeOutOf,
        date: iq.date,

        // ⭐ ADD THESE
        percentage: studentGrade?.percentage ?? null,
        letterGrade: studentGrade?.letterGrade ?? null,
      };
    });

    // ✅ Final response
    res.json({
      attendance,
      tasks: taskStatus,
      quizzes: quizGrades,
      inClassQuizzes: inClassGrades, // ✅ added
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

    // 2. For each child, reuse the logic
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

        // 🔹 Resolve teacherId
        let teacherId = null;
        if (child.groupId.teacherId) teacherId = child.groupId.teacherId;
        if (!teacherId && child.yearId?.teacherId) teacherId = child.yearId.teacherId;
        if (!teacherId && child.realTeacherId) teacherId = child.realTeacherId;

        if (!teacherId) {
          return {
            childId: child._id,
            childName: child.name,
            msg: "❌ Could not resolve teacher for this student",
          };
        }

        // 🔹 Fetch assistants for this teacher
        const assistants = await User.find({ assistantOf: teacherId }).select("_id");
        const assistantIds = assistants.map(a => a._id);

        // Attendance
        const sessions = await Session.find({ groupId, teacherId }).populate("attendance.studentId");
        // 🔹 Filter out any null attendance records
        sessions.forEach((s) => {
          s.attendance = s.attendance.filter((a) => a.studentId); // remove nulls
        });

        const attendance = sessions.map((s) => {
          const studentAttendance = s.attendance.find(
            (a) => a.studentId && a.studentId._id.toString() === child._id.toString()
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
          submitted: submissions.some((s) => s.taskId.toString() === t._id.toString()),
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

        // 🧩 In-Class Quizzes (include assistant-created)
        const inClassQuizzes = await InClassQuiz.find({
          groupId,
          teacherId: { $in: [teacherId, ...assistantIds] },
        }).populate("studentGrades.studentId", "name");

        const inClassGrades = inClassQuizzes.map((iq) => {
          const studentGrade = iq.studentGrades.find((g) => {
            const id =
              typeof g.studentId === "object"
                ? g.studentId?._id?.toString()
                : g.studentId?.toString();
            return id === child._id.toString();
          });

          return {
            quizName: iq.quizName,
            score: studentGrade?.grade ?? null,
            total: iq.gradeOutOf,
            date: iq.date,
            percentage: studentGrade?.percentage ?? null,
            letterGrade: studentGrade?.letterGrade ?? null,
          };
        });

        return {
          childId: child._id,
          childName: child.name,
          attendance,
          tasks: taskStatus,
          quizzes: quizGrades,
          inClassQuizzes: inClassGrades, // ✅ added
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

// 🔍 TEST — Send report to ONE student manually
router.get("/test-report/:studentId", async (req, res) => {
  try {
    const axios = require("axios");  // ✅ FIX ADDED HERE
    const { sendMessage } = require("../utils/wapilot");
    const { studentId } = req.params;

    const BASE_URL = process.env.BASE_URL || "http://localhost:5000";

    const student = await User.findById(studentId).populate("parentId");

    if (!student) {
      return res.status(404).json({ msg: "❌ Student not found" });
    }

    if (!student.studentPhone && !student.parentPhone && !student.parentId?.parentPhone) {
      return res.status(400).json({ msg: "❌ No phone numbers available" });
    }

    // Fetch performance using existing API
    const perfRes = await axios.get(`${BASE_URL}/api/performance/student/${studentId}`);
    const performance = perfRes.data;

    // Build message
    const reportText = `
📘 *Weekly Performance Report – ${student.name}*

🟦 *Attendance*
${performance.attendance.map(a => `• ${a.title}: ${a.present ? "Present" : "Absent"}`).join("\n")}

🟩 *Tasks*
${performance.tasks.map(t => `• ${t.title}: ${t.submitted ? "Submitted" : "Not Submitted"}`).join("\n")}

🟧 *Online Quizzes*
${performance.quizzes.map(q =>
  `• ${q.quizTitle}: ${q.score !== null ? `${q.score}/${q.total}` : "Not Attempted"}`
).join("\n")}

🟪 *In-Class Quizzes*
${performance.inClassQuizzes.map(q =>
  `• ${q.quizName}: ${
    q.score !== null
      ? `${q.score}/${q.total} – ${q.percentage ?? "—"}% (${q.letterGrade ?? "—"})`
      : "Not Graded"
  }`
).join("\n")}

——
🧪 *This is a test message. Weekly reports are NOT sent yet.*
`.trim();

    // Send to student
    if (student.studentPhone) {
      await sendMessage(`${student.studentPhone}@c.us`, reportText);
      console.log(`📤 Test report sent to student: ${student.name}`);
    }

    // Send to parent
    const parentPhone = student.parentPhone || student.parentId?.parentPhone;
    if (parentPhone) {
      await sendMessage(`${parentPhone}@c.us`, reportText);
      console.log(`📤 Test report sent to parent of: ${student.name}`);
    }

    res.json({ msg: "✅ Test report sent successfully." });

  } catch (err) {
    console.error("❌ Error sending test report:", err.message);
    res.status(500).json({ msg: "❌ Error sending test report", error: err.message });
  }
});






module.exports = router;
