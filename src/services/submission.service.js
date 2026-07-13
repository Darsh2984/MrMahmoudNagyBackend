const prisma = require("../config/prisma");
const storage = require("./storage.service");
const { notify } = require("./notification.service");

/** Student submits homework for a task. */
async function submitHomework({ taskId, studentId, file }) {
  const task = await prisma.task.findUnique({ where: { id: taskId } });
  if (!task) throw { status: 404, msg: "Task not found" };

  const existing = await prisma.submission.findFirst({ where: { taskId, studentId } });
  if (existing) throw { status: 400, msg: "You've already submitted this task" };

  let fileUrl = null;
  if (file) {
    fileUrl = await storage.uploadBuffer(file.buffer, file.originalname, file.mimetype, "submissions");
  }

  return prisma.submission.create({ data: { taskId, studentId, fileUrl } });
}

/** Direct grading — used when a Teacher/Head grades a submission themselves (no delegation). */
async function gradeSubmission({ submissionId, grade, comments, correctedFile }) {
  const submission = await prisma.submission.findUnique({ where: { id: submissionId } });
  if (!submission) throw { status: 404, msg: "Submission not found" };

  let correctedFileUrl = submission.correctedFileUrl;
  if (correctedFile) {
    correctedFileUrl = await storage.uploadBuffer(
      correctedFile.buffer,
      correctedFile.originalname,
      correctedFile.mimetype,
      "corrected"
    );
  }

  const graded = await prisma.submission.update({
    where: { id: submissionId },
    data: { grade, comments, correctedFileUrl, gradedAt: new Date() },
  });

  notify({
    userId: submission.studentId,
    type: "GRADE_POSTED",
    title: "Your homework was graded",
    body: `You scored ${grade}`,
    link: `/submissions/${submissionId}`,
  }).catch((err) => console.error("notify() failed:", err.message));

  return graded;
}

module.exports = { submitHomework, gradeSubmission };
