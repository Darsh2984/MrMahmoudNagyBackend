const ExcelJS = require("exceljs");
const prisma = require("../config/prisma");

/**
 * Core aggregation: attendance, task submission status, quiz scores, and in-class
 * quiz grades for one student within one group. This is the building block both the
 * single-student view AND the group Excel export are built from.
 */
async function getStudentPerformance(studentId, groupId) {
  const [sessions, tasks, quizzes, inClassQuizzes] = await Promise.all([
    prisma.session.findMany({
      where: { groupId },
      include: { attendance: { where: { studentId } } },
      orderBy: { date: "asc" },
    }),
    prisma.task.findMany({ where: { groups: { some: { groupId } } } }),
    prisma.quiz.findMany({ where: { groups: { some: { groupId } } }, include: { questions: true } }),
    prisma.inClassQuiz.findMany({ where: { groupId }, orderBy: { date: "asc" } }),
  ]);

  const taskIds = tasks.map((t) => t.id);
  const quizIds = quizzes.map((q) => q.id);

  const [submissions, quizSubmissions] = await Promise.all([
    prisma.submission.findMany({ where: { studentId, taskId: { in: taskIds } } }),
    prisma.quizSubmission.findMany({ where: { studentId, quizId: { in: quizIds } } }),
  ]);

  const submittedTaskIds = new Set(submissions.map((s) => s.taskId));
  const quizSubMap = new Map(quizSubmissions.map((s) => [s.quizId, s]));

  const attendance = sessions.map((s) => ({
    date: s.date,
    title: s.title,
    present: s.attendance[0]?.status === "PRESENT",
  }));

  const taskResults = tasks.map((t) => ({
    taskId: t.id,
    title: t.title,
    submitted: submittedTaskIds.has(t.id),
  }));

  const quizResults = quizzes.map((q) => {
    const sub = quizSubMap.get(q.id);
    return {
      quizId: q.id,
      title: q.title,
      attempted: !!sub,
      score: sub?.score ?? null,
      total: q.questions.length,
    };
  });

  const inClassResults = inClassQuizzes.map((iq) => {
    const grade = Array.isArray(iq.studentGrades) ? iq.studentGrades.find((g) => g.studentId === studentId) : null;
    return {
      quizId: iq.id,
      quizName: iq.quizName,
      grade: grade?.grade ?? null,
      gradeOutOf: iq.gradeOutOf,
    };
  });

  return { attendance, tasks: taskResults, quizzes: quizResults, inClassQuizzes: inClassResults };
}

/** Group-wide matrix export, matching the old system's Excel shape (students as rows). */
async function exportGroupPerformanceWorkbook(groupId) {
  const group = await prisma.group.findUnique({
    where: { id: groupId },
    include: { members: { include: { student: true } } },
  });
  if (!group) throw { status: 404, msg: "Group not found" };

  const [sessions, tasks, quizzes, inClassQuizzes] = await Promise.all([
    prisma.session.findMany({ where: { groupId }, include: { attendance: true }, orderBy: { date: "asc" } }),
    prisma.task.findMany({ where: { groups: { some: { groupId } } } }),
    prisma.quiz.findMany({ where: { groups: { some: { groupId } } }, include: { questions: true } }),
    prisma.inClassQuiz.findMany({ where: { groupId }, orderBy: { date: "asc" } }),
  ]);

  const studentIds = group.members.map((m) => m.studentId);
  const taskIds = tasks.map((t) => t.id);
  const quizIds = quizzes.map((q) => q.id);

  const [taskSubs, quizSubs] = await Promise.all([
    prisma.submission.findMany({ where: { studentId: { in: studentIds }, taskId: { in: taskIds } } }),
    prisma.quizSubmission.findMany({ where: { studentId: { in: studentIds }, quizId: { in: quizIds } } }),
  ]);

  const taskSubSet = new Set(taskSubs.map((s) => `${s.studentId}_${s.taskId}`));
  const quizSubMap = new Map(quizSubs.map((s) => [`${s.studentId}_${s.quizId}`, s]));

  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet(`${group.name} Performance`);

  worksheet.columns = [
    { header: "Student Name", key: "studentName", width: 25 },
    { header: "Student Phone", key: "studentPhone", width: 20 },
    { header: "Parent Name", key: "parentName", width: 25 },
    { header: "Parent Phone", key: "parentPhone", width: 20 },
    ...sessions.map((s) => ({ header: `Session: ${s.title}`, key: `session_${s.id}`, width: 18 })),
    ...tasks.map((t) => ({ header: `Task: ${t.title}`, key: `task_${t.id}`, width: 25 })),
    ...quizzes.map((q) => ({ header: `Quiz: ${q.title}`, key: `quiz_${q.id}`, width: 20 })),
    ...inClassQuizzes.map((iq) => ({ header: `In-Class Quiz: ${iq.quizName}`, key: `inclass_${iq.id}`, width: 20 })),
  ];

  for (const membership of group.members) {
    const student = membership.student;
    const sid = student.id;
    const row = {
      studentName: student.name,
      studentPhone: student.phone || "N/A",
      parentName: student.parentName || "N/A",
      parentPhone: student.parentPhone || "N/A",
    };

    for (const s of sessions) {
      const record = s.attendance.find((a) => a.studentId === sid);
      row[`session_${s.id}`] = record?.status === "PRESENT" ? "Present" : "Absent";
    }
    for (const t of tasks) {
      row[`task_${t.id}`] = taskSubSet.has(`${sid}_${t.id}`) ? "Submitted" : "Not Submitted";
    }
    for (const q of quizzes) {
      const sub = quizSubMap.get(`${sid}_${q.id}`);
      row[`quiz_${q.id}`] = sub?.score != null ? `${sub.score}/${q.questions.length}` : "Not Attempted";
    }
    for (const iq of inClassQuizzes) {
      const grade = Array.isArray(iq.studentGrades) ? iq.studentGrades.find((g) => g.studentId === sid) : null;
      row[`inclass_${iq.id}`] = grade?.grade != null ? `${grade.grade}/${iq.gradeOutOf}` : "Not Attempted";
    }

    worksheet.addRow(row);
  }

  const headerRow = worksheet.getRow(1);
  headerRow.font = { bold: true, color: { argb: "FFFFFFFF" } };
  headerRow.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0B3C49" } };

  return { workbook, groupName: group.name };
}

module.exports = { getStudentPerformance, exportGroupPerformanceWorkbook };
