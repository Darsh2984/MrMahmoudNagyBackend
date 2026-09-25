const ExcelJS = require("exceljs");
const prisma = require("../config/prisma");

function taskResult(task, submission) {
  return {
    taskId: task.id,
    quizId: task.id,
    title: task.title,
    quizName: task.title,
    dueDate: task.deadline,
    submitted: Boolean(submission),
    grade: submission?.grade ?? null,
    gradeOutOf: task.gradeOutOf,
    taskType: task.taskType || "HOMEWORK",
  };
}

/** Attendance and the two task-based performance categories for one student. */
async function getStudentPerformance(studentId, groupId) {
  const [sessions, tasks] = await Promise.all([
    prisma.session.findMany({
      where: { groupId },
      include: { attendance: { where: { studentId } } },
      orderBy: { date: "asc" },
    }),
    prisma.task.findMany({
      where: { groups: { some: { groupId } } },
      orderBy: [{ deadline: "asc" }, { id: "asc" }],
    }),
  ]);

  const submissions = await prisma.submission.findMany({
    where: {
      studentId,
      taskId: { in: tasks.map((task) => task.id) },
    },
  });
  const submissionByTaskId = new Map(
    submissions.map((submission) => [submission.taskId, submission]),
  );

  const attendance = sessions.map((session) => ({
    date: session.date,
    title: session.title,
    present: session.attendance[0]?.status === "PRESENT",
  }));
  const results = tasks.map((task) =>
    taskResult(task, submissionByTaskId.get(task.id)),
  );

  const homework = results.filter((item) => item.taskType === "HOMEWORK");
  const inClassQuizzes = results.filter(
    (item) => item.taskType === "IN_CLASS_QUIZ",
  );

  return {
    attendance,
    homework,
    inClassQuizzes,
    // Transitional aliases keep already-installed mobile builds usable until
    // their next OTA update. New clients use homework/inClassQuizzes.
    tasks: homework,
    quizzes: [],
  };
}

/** Group-wide matrix export, with attendance and tasks grouped by task type. */
async function exportGroupPerformanceWorkbook(groupId) {
  const group = await prisma.group.findUnique({
    where: { id: groupId },
    include: { members: { include: { student: true } } },
  });
  if (!group) throw { status: 404, msg: "Group not found" };

  const [sessions, tasks] = await Promise.all([
    prisma.session.findMany({
      where: { groupId },
      include: { attendance: true },
      orderBy: { date: "asc" },
    }),
    prisma.task.findMany({
      where: { groups: { some: { groupId } } },
      orderBy: { deadline: "asc" },
    }),
  ]);

  const taskSubmissions = await prisma.submission.findMany({
    where: {
      studentId: { in: group.members.map((member) => member.studentId) },
      taskId: { in: tasks.map((task) => task.id) },
    },
  });
  const taskSubmissionMap = new Map(
    taskSubmissions.map((submission) => [
      `${submission.studentId}_${submission.taskId}`,
      submission,
    ]),
  );

  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet(`${group.name} Performance`);

  worksheet.columns = [
    { header: "Student Name", key: "studentName", width: 25 },
    { header: "Student Phone", key: "studentPhone", width: 20 },
    { header: "Father Name", key: "fatherName", width: 22 },
    { header: "Father Phone", key: "fatherPhone", width: 18 },
    { header: "Mother Name", key: "motherName", width: 22 },
    { header: "Mother Phone", key: "motherPhone", width: 18 },
    ...sessions.map((session) => ({
      header: `Session: ${session.title}`,
      key: `session_${session.id}`,
      width: 18,
    })),
    ...tasks.map((task) => ({
      header: `${task.taskType === "IN_CLASS_QUIZ" ? "In-Class Quiz" : "Homework"}: ${task.title}`,
      key: `task_${task.id}`,
      width: 25,
    })),
  ];

  for (const membership of group.members) {
    const student = membership.student;
    const row = {
      studentName: student.name,
      studentPhone: student.phone || "N/A",
      fatherName: student.fatherName || "N/A",
      fatherPhone: student.fatherPhone || "N/A",
      motherName: student.motherName || "N/A",
      motherPhone: student.motherPhone || "N/A",
    };

    for (const session of sessions) {
      const record = session.attendance.find(
        (attendance) => attendance.studentId === student.id,
      );
      row[`session_${session.id}`] =
        record?.status === "PRESENT" ? "Present" : "Absent";
    }
    for (const task of tasks) {
      const submission = taskSubmissionMap.get(`${student.id}_${task.id}`);
      row[`task_${task.id}`] = submission
        ? submission.grade != null
          ? `${submission.grade}/${task.gradeOutOf}`
          : "Submitted"
        : "Not Submitted";
    }

    worksheet.addRow(row);
  }

  const headerRow = worksheet.getRow(1);
  headerRow.font = { bold: true, color: { argb: "FFFFFFFF" } };
  headerRow.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FF0B3C49" },
  };

  return { workbook, groupName: group.name };
}

module.exports = {
  getStudentPerformance,
  exportGroupPerformanceWorkbook,
};
