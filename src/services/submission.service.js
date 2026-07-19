const prisma = require("../config/prisma");
const storage = require("./storage.service");
const { notify } = require("./notification.service");

/** Student submits homework for a task. */
async function submitHomework({ taskId, studentId, file }) {
  const task = await prisma.task.findUnique({
    where: {
      id: taskId,
    },
    include: {
      groups: {
        select: {
          groupId: true,
        },
      },
    },
  });

  if (!task) {
    throw {
      status: 404,
      msg: "Task not found",
    };
  }

  const taskGroupIds = task.groups.map(
    (taskGroup) => taskGroup.groupId,
  );

  const membershipCount =
    await prisma.groupMembership.count({
      where: {
        studentId,
        groupId: {
          in: taskGroupIds,
        },
      },
    });

  if (membershipCount === 0) {
    throw {
      status: 403,
      msg: "You are not assigned to this task",
    };
  }

  if (!task.allowLateSubmission && new Date() > task.deadline) {
    throw { status: 400, msg: "The deadline has passed and late submissions are not allowed for this task" };
  }

  const existing = await prisma.submission.findFirst({ where: { taskId, studentId } });
  if (existing) throw { status: 400, msg: "You've already submitted this task" };

  let fileUrl = null;
  if (file) {
    fileUrl = await storage.uploadBuffer(file.buffer, file.originalname, file.mimetype, "submissions");
  }

  return prisma.submission.create({ data: { taskId, studentId, fileUrl } });
}

/** Direct grading — Teacher/Head, or an eligible assistant. */
async function gradeSubmission({
  submissionId,
  grade,
  comments,
  correctedFile,
  gradedBy,
}) {
  const submission = await prisma.submission.findUnique({
    where: {
      id: submissionId,
    },
    include: {
      task: {
        include: {
          groups: {
            select: {
              groupId: true,
            },
          },
        },
      },
      delegation: {
        select: {
          id: true,
          assistantId: true,
          completedAt: true,
        },
      },
    },
  });

  if (!submission) {
    throw {
      status: 404,
      msg: "Submission not found",
    };
  }

  if (!gradedBy) {
    throw {
      status: 401,
      msg: "Unauthorized",
    };
  }

  const isTeacher = gradedBy.role === "TEACHER";
  const isHeadAssistant =
    gradedBy.role === "ASSISTANT" &&
    gradedBy.isHeadAssistant === true;

  if (!isTeacher && !isHeadAssistant) {
    if (gradedBy.role !== "ASSISTANT") {
      throw {
        status: 403,
        msg: "You are not allowed to grade this submission",
      };
    }

    const taskGroupIds = submission.task.groups.map(
      (taskGroup) => taskGroup.groupId,
    );

    const assignmentCount =
      await prisma.assistantGroupAssignment.count({
        where: {
          assistantId: gradedBy.id,
          groupId: {
            in: taskGroupIds,
          },
        },
      });

    if (assignmentCount === 0) {
      throw {
        status: 403,
        msg: "You are not assigned to this submission's group",
      };
    }

    if (
      submission.delegation &&
      submission.delegation.assistantId !== gradedBy.id
    ) {
      throw {
        status: 403,
        msg: "This submission was delegated to another assistant",
      };
    }
  }

  const numericGrade = Number(grade);
  const maximumGrade = Number(submission.task.gradeOutOf);

  if (!Number.isFinite(numericGrade)) {
    throw {
      status: 400,
      msg: "Grade must be a valid number",
    };
  }

  if (
    numericGrade < 0 ||
    numericGrade > maximumGrade
  ) {
    throw {
      status: 400,
      msg: `Grade must be between 0 and ${maximumGrade}`,
    };
  }

  let correctedFileUrl = submission.correctedFileUrl;

  if (correctedFile) {
    correctedFileUrl = await storage.uploadBuffer(
      correctedFile.buffer,
      correctedFile.originalname,
      correctedFile.mimetype,
      "corrected",
    );
  }

  const graded = await prisma.$transaction(async (tx) => {
    const updatedSubmission = await tx.submission.update({
      where: {
        id: submissionId,
      },
      data: {
        grade: numericGrade,
        comments,
        correctedFileUrl,
        gradedAt: new Date(),
      },
    });

    if (
      submission.delegation &&
      submission.delegation.assistantId === gradedBy.id &&
      !submission.delegation.completedAt
    ) {
      await tx.delegation.update({
        where: {
          id: submission.delegation.id,
        },
        data: {
          completedAt: new Date(),
        },
      });
    }

    return updatedSubmission;
  });

  notify({
    userId: submission.studentId,
    type: "GRADE_POSTED",
    title: "Your homework was graded",
    body: `You scored ${numericGrade}/${maximumGrade}`,
    link: `/my-tasks/${submission.taskId}`,
  }).catch((err) =>
    console.error("notify() failed:", err.message),
  );

  return graded;
}

module.exports = { submitHomework, gradeSubmission };
