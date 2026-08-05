const prisma = require("../config/prisma");
const storage = require("./storage.service");
const { notify } = require("./notification.service");

const MAX_TOTAL_FILES = 20;
const MAX_CORRECTED_FILES = 20;

function createServiceError(status, msg, data) {
  const error = new Error(msg);

  error.status = status;
  error.msg = msg;

  if (data !== undefined) {
    error.data = data;
  }

  return error;
}

async function getSignedUrl(objectKey) {
  if (!objectKey) {
    return null;
  }

  return storage.getSignedUrl(objectKey, 15);
}

async function mapSubmissionFile(file) {
  return {
    id: file.id,
    originalName: file.originalName,
    contentType: file.contentType,
    size: file.size,
    order: file.order,
    uploadedAfterDeadline:
      file.uploadedAfterDeadline,
    uploadedAt: file.uploadedAt,
    fileUrl: await getSignedUrl(file.objectKey),
  };
}

async function mapCorrectedFile(file) {
  return {
    id: file.id,
    originalName: file.originalName,
    contentType: file.contentType,
    size: file.size,
    order: file.order,
    uploadedAt: file.uploadedAt,
    uploadedById: file.uploadedById,
    uploadedBy: file.uploadedBy || null,
    fileUrl: await getSignedUrl(file.objectKey),
  };
}

async function mapSubmission(submission) {
  const [files, correctedFiles, legacyFileUrl, legacyCorrectedFileUrl] =
    await Promise.all([
      Promise.all(
        (submission.files || []).map(mapSubmissionFile),
      ),

      Promise.all(
        (submission.correctedFiles || []).map(
          mapCorrectedFile,
        ),
      ),

      getSignedUrl(submission.fileUrl),

      getSignedUrl(submission.correctedFileUrl),
    ]);

  return {
    ...submission,

    fileUrl: legacyFileUrl,
    correctedFileUrl: legacyCorrectedFileUrl,

    files,
    correctedFiles,

    fileCount: files.length,
    correctedFileCount: correctedFiles.length,

    wasModifiedAfterDeadline:
      submission.lastModifiedAfterDeadline,

    canModify: submission.grade === null,
  };
}

async function getTaskForStudent({
  taskId,
  studentId,
}) {
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
    throw createServiceError(
      404,
      "Task not found",
    );
  }

  const taskGroupIds = task.groups.map(
    (taskGroup) => taskGroup.groupId,
  );

  if (!taskGroupIds.length) {
    throw createServiceError(
      403,
      "This task is not assigned to a group.",
    );
  }

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
    throw createServiceError(
      403,
      "You are not assigned to this task",
    );
  }

  return task;
}

function getModificationState(
  task,
  now = new Date(),
) {
  const deadline = new Date(task.deadline);

  const afterDeadline =
    Number.isFinite(deadline.getTime()) &&
    now > deadline;

  if (
    afterDeadline &&
    !task.allowLateSubmission
  ) {
    return {
      allowed: false,
      afterDeadline: true,
      message:
        "The deadline has passed and late submissions or modifications are not allowed for this task.",
    };
  }

  return {
    allowed: true,
    afterDeadline,
    message: afterDeadline
      ? "This homework was modified after the deadline."
      : null,
  };
}

async function findStudentSubmission({
  taskId,
  studentId,
}) {
  return prisma.submission.findUnique({
    where: {
      taskId_studentId: {
        taskId,
        studentId,
      },
    },

    include: {
      files: {
        orderBy: {
          order: "asc",
        },
      },

      correctedFiles: {
        include: {
          uploadedBy: {
            select: {
              id: true,
              name: true,
            },
          },
        },

        orderBy: {
          order: "asc",
        },
      },

      gradedBy: {
        select: {
          id: true,
          name: true,
          role: true,
          isHeadAssistant: true,
        },
      },

      task: {
        select: {
          id: true,
          title: true,
          deadline: true,
          allowLateSubmission: true,
          gradeOutOf: true,
        },
      },
    },
  });
}

async function submitHomework({
  taskId,
  studentId,
  files,
}) {
  if (
    !Array.isArray(files) ||
    !files.length
  ) {
    throw createServiceError(
      400,
      "Select at least one homework file.",
    );
  }

  const task = await getTaskForStudent({
    taskId,
    studentId,
  });

  const modificationState =
    getModificationState(task);

  if (!modificationState.allowed) {
    throw createServiceError(
      400,
      modificationState.message,
    );
  }

  let submission =
    await findStudentSubmission({
      taskId,
      studentId,
    });

  if (
    submission &&
    submission.grade !== null
  ) {
    throw createServiceError(
      409,
      "This homework has already been graded and can no longer be modified.",
    );
  }

  const existingFileCount =
    submission?.files?.length || 0;

  if (
    existingFileCount + files.length >
    MAX_TOTAL_FILES
  ) {
    throw createServiceError(
      400,
      `A homework submission may contain a maximum of ${MAX_TOTAL_FILES} files.`,
      {
        existingFileCount,
        selectedFileCount: files.length,
      },
    );
  }

  const highestExistingOrder =
    (submission?.files || []).reduce(
      (highest, file) =>
        Math.max(
          highest,
          Number(file.order || 0),
        ),
      -1,
    );

  const uploadedObjects = [];

  try {
    for (
      let index = 0;
      index < files.length;
      index += 1
    ) {
      const file = files[index];

      const originalName =
        file.originalname ||
        `homework-${index + 1}`;

      const contentType =
        file.mimetype ||
        "application/octet-stream";

      const objectKey =
        await storage.uploadBuffer(
          file.buffer,
          originalName,
          contentType,
          `homework-submissions/${taskId}/${studentId}`,
        );

      uploadedObjects.push({
        objectKey,
        originalName,
        contentType,

        size: Number.isFinite(
          Number(file.size),
        )
          ? Number(file.size)
          : file.buffer.length,

        order:
          highestExistingOrder +
          index +
          1,

        uploadedAfterDeadline:
          modificationState.afterDeadline,
      });
    }

    submission =
      await prisma.$transaction(
        async (tx) => {
          let currentSubmission =
            submission;

          const now = new Date();

          if (!currentSubmission) {
            currentSubmission =
              await tx.submission.create({
                data: {
                  taskId,
                  studentId,
                  firstSubmittedAt: now,
                  submittedAt: now,
                  lastModifiedAt: now,

                  lastModifiedAfterDeadline:
                    modificationState.afterDeadline,
                },
              });
          } else {
            currentSubmission =
              await tx.submission.update({
                where: {
                  id: currentSubmission.id,
                },

                data: {
                  submittedAt: now,
                  lastModifiedAt: now,

                  lastModifiedAfterDeadline:
                    currentSubmission
                      .lastModifiedAfterDeadline ||
                    modificationState.afterDeadline,
                },
              });
          }

          await Promise.all(
            uploadedObjects.map(
              (uploadedFile) =>
                tx.submissionFile.create({
                  data: {
                    submissionId:
                      currentSubmission.id,

                    objectKey:
                      uploadedFile.objectKey,

                    originalName:
                      uploadedFile.originalName,

                    contentType:
                      uploadedFile.contentType,

                    size:
                      uploadedFile.size,

                    order:
                      uploadedFile.order,

                    uploadedAfterDeadline:
                      uploadedFile
                        .uploadedAfterDeadline,

                    uploadedById:
                      studentId,
                  },
                }),
            ),
          );

          return tx.submission.findUnique({
            where: {
              id: currentSubmission.id,
            },

            include: {
              files: {
                orderBy: {
                  order: "asc",
                },
              },

              correctedFiles: {
                include: {
                  uploadedBy: {
                    select: {
                      id: true,
                      name: true,
                    },
                  },
                },

                orderBy: {
                  order: "asc",
                },
              },

              gradedBy: {
                select: {
                  id: true,
                  name: true,
                  role: true,
                  isHeadAssistant: true,
                },
              },

              task: {
                select: {
                  id: true,
                  title: true,
                  deadline: true,
                  allowLateSubmission: true,
                  gradeOutOf: true,
                },
              },
            },
          });
        },
      );
  } catch (error) {
    await Promise.allSettled(
      uploadedObjects.map(
        (uploadedFile) =>
          storage.deleteFile(
            uploadedFile.objectKey,
          ),
      ),
    );

    throw error;
  }

  return mapSubmission(submission);
}

async function getMyHomeworkSubmission({
  taskId,
  studentId,
}) {
  await getTaskForStudent({
    taskId,
    studentId,
  });

  const submission =
    await findStudentSubmission({
      taskId,
      studentId,
    });

  if (!submission) {
    return null;
  }

  const modificationState =
    getModificationState(
      submission.task,
    );

  const mapped =
    await mapSubmission(submission);

  return {
    ...mapped,

    canModify:
      submission.grade === null &&
      modificationState.allowed,

    modificationBlockedReason:
      submission.grade !== null
        ? "This homework has already been graded."
        : modificationState.allowed
          ? null
          : modificationState.message,
  };
}

async function deleteHomeworkFile({
  submissionId,
  fileId,
  studentId,
}) {
  const submission =
    await prisma.submission.findFirst({
      where: {
        id: submissionId,
        studentId,
      },

      include: {
        files: {
          orderBy: {
            order: "asc",
          },
        },

        task: {
          select: {
            id: true,
            title: true,
            deadline: true,
            allowLateSubmission: true,
            gradeOutOf: true,
          },
        },
      },
    });

  if (!submission) {
    throw createServiceError(
      404,
      "Homework submission not found.",
    );
  }

  if (submission.grade !== null) {
    throw createServiceError(
      409,
      "This homework has already been graded and its files cannot be changed.",
    );
  }

  const modificationState =
    getModificationState(
      submission.task,
    );

  if (!modificationState.allowed) {
    throw createServiceError(
      400,
      modificationState.message,
    );
  }

  const file = submission.files.find(
    (item) => item.id === fileId,
  );

  if (!file) {
    throw createServiceError(
      404,
      "Homework file not found.",
    );
  }

  await prisma.$transaction(
    async (tx) => {
      await tx.submissionFile.delete({
        where: {
          id: file.id,
        },
      });

      const remainingFiles =
        await tx.submissionFile.findMany({
          where: {
            submissionId:
              submission.id,
          },

          orderBy: {
            order: "asc",
          },
        });

      await Promise.all(
        remainingFiles.map(
          (remainingFile, index) =>
            tx.submissionFile.update({
              where: {
                id: remainingFile.id,
              },

              data: {
                order: index,
              },
            }),
        ),
      );

      await tx.submission.update({
        where: {
          id: submission.id,
        },

        data: {
          submittedAt: new Date(),
          lastModifiedAt: new Date(),

          lastModifiedAfterDeadline:
            submission
              .lastModifiedAfterDeadline ||
            modificationState.afterDeadline,
        },
      });
    },
  );

  try {
    await storage.deleteFile(
      file.objectKey,
    );
  } catch (error) {
    console.error(
      "Failed to remove homework file from R2:",
      error.message,
    );
  }

  const updatedSubmission =
    await findStudentSubmission({
      taskId: submission.taskId,
      studentId,
    });

  return mapSubmission(
    updatedSubmission,
  );
}

async function assertCanGradeSubmission({
  submission,
  gradedBy,
}) {
  if (!gradedBy) {
    throw createServiceError(
      401,
      "Unauthorized",
    );
  }

  const isTeacher =
    gradedBy.role === "TEACHER";

  const isHeadAssistant =
    gradedBy.role === "ASSISTANT" &&
    gradedBy.isHeadAssistant === true;

  if (
    isTeacher ||
    isHeadAssistant
  ) {
    return;
  }

  if (
    gradedBy.role !== "ASSISTANT"
  ) {
    throw createServiceError(
      403,
      "You are not allowed to grade this submission",
    );
  }

  const taskGroupIds =
    submission.task.groups.map(
      (taskGroup) =>
        taskGroup.groupId,
    );

  const assignmentCount =
    await prisma
      .assistantGroupAssignment
      .count({
        where: {
          assistantId: gradedBy.id,

          groupId: {
            in: taskGroupIds,
          },
        },
      });

  if (assignmentCount === 0) {
    throw createServiceError(
      403,
      "You are not assigned to this submission's group",
    );
  }

  if (
    !submission.delegation ||
    submission.delegation
      .assistantId !== gradedBy.id
  ) {
    throw createServiceError(
      403,
      "This submission has not been delegated to you",
    );
  }
}

async function uploadCorrectedFiles({
  submissionId,
  taskId,
  files,
  uploadedById,
  startingOrder,
}) {
  const uploadedObjects = [];

  for (
    let index = 0;
    index < files.length;
    index += 1
  ) {
    const file = files[index];

    const originalName =
      file.originalname ||
      `corrected-file-${index + 1}`;

    const contentType =
      file.mimetype ||
      "application/octet-stream";

    const objectKey =
      await storage.uploadBuffer(
        file.buffer,
        originalName,
        contentType,
        `corrected-homework/${taskId}/${submissionId}`,
      );

    uploadedObjects.push({
      objectKey,
      originalName,
      contentType,

      size: Number.isFinite(
        Number(file.size),
      )
        ? Number(file.size)
        : file.buffer.length,

      order:
        startingOrder + index,

      uploadedById,
    });
  }

  return uploadedObjects;
}


function normalizeOptionalText(value) {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim();

  return normalized || null;
}

function assertCanReopenSubmission(requestedBy) {
  if (!requestedBy) {
    throw createServiceError(
      401,
      "Unauthorized",
    );
  }

  const isTeacher =
    requestedBy.role === "TEACHER";

  const isHeadAssistant =
    requestedBy.role === "ASSISTANT" &&
    requestedBy.isHeadAssistant === true;

  if (!isTeacher && !isHeadAssistant) {
    throw createServiceError(
      403,
      "Only the Teacher or Head Assistant can reopen a graded submission.",
    );
  }
}

async function getGradingHistory({
  submissionId,
  requestedBy,
}) {
  if (!requestedBy) {
    throw createServiceError(
      401,
      "Unauthorized",
    );
  }

  const isTeacher =
    requestedBy.role === "TEACHER";

  const isHeadAssistant =
    requestedBy.role === "ASSISTANT" &&
    requestedBy.isHeadAssistant === true;

  const isAssistant =
    requestedBy.role === "ASSISTANT";

  if (
    !isTeacher &&
    !isHeadAssistant &&
    !isAssistant
  ) {
    throw createServiceError(
      403,
      "You are not allowed to view grading history.",
    );
  }

  const submission =
    await prisma.submission.findUnique({
      where: {
        id: submissionId,
      },

      include: {
        delegation: {
          select: {
            assistantId: true,
          },
        },
      },
    });

  if (!submission) {
    throw createServiceError(
      404,
      "Submission not found",
    );
  }

  if (
    isAssistant &&
    !isHeadAssistant &&
    submission.delegation?.assistantId !==
      requestedBy.id
  ) {
    throw createServiceError(
      403,
      "This submission has not been delegated to you.",
    );
  }

  const history =
    await prisma.homeworkGradingHistory.findMany({
      where: {
        submissionId,
      },

      include: {
        changedBy: {
          select: {
            id: true,
            name: true,
            role: true,
            isHeadAssistant: true,
          },
        },
      },

      orderBy: {
        createdAt: "desc",
      },
    });

  return {
    submissionId,
    history,
  };
}

async function gradeSubmission({
  submissionId,
  grade,
  comments,
  correctedFiles = [],
  gradedBy,
}) {
  const submission =
    await prisma.submission.findUnique({
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

        correctedFiles: {
          orderBy: {
            order: "asc",
          },
        },
      },
    });

  if (!submission) {
    throw createServiceError(
      404,
      "Submission not found",
    );
  }

  await assertCanGradeSubmission({
    submission,
    gradedBy,
  });

  const wasPreviouslyGraded =
    submission.grade !== null;

  const previousGrade =
    submission.grade;

  const previousComments =
    submission.comments || null;

  const previousGradedAt =
    submission.gradedAt || null;

  const previousGradedById =
    submission.gradedById || null;


  const numericGrade =
    Number(grade);

  const maximumGrade =
    Number(
      submission.task.gradeOutOf,
    );

  if (!Number.isFinite(numericGrade)) {
    throw createServiceError(
      400,
      "Grade must be a valid number",
    );
  }

  if (
    numericGrade < 0 ||
    numericGrade > maximumGrade
  ) {
    throw createServiceError(
      400,
      `Grade must be between 0 and ${maximumGrade}`,
    );
  }

  const normalizedComments =
    normalizeOptionalText(comments);

  const incomingCorrectedFiles =
    Array.isArray(correctedFiles)
      ? correctedFiles
      : [];

  if (
    submission.correctedFiles.length +
      incomingCorrectedFiles.length >
    MAX_CORRECTED_FILES
  ) {
    throw createServiceError(
      400,
      `A graded submission may contain a maximum of ${MAX_CORRECTED_FILES} corrected files.`,
    );
  }

  const highestOrder =
    submission.correctedFiles.reduce(
      (highest, file) =>
        Math.max(
          highest,
          Number(file.order || 0),
        ),
      -1,
    );

  let uploadedObjects = [];

  try {
    uploadedObjects =
      await uploadCorrectedFiles({
        submissionId,
        taskId: submission.taskId,
        files:
          incomingCorrectedFiles,
        uploadedById: gradedBy.id,
        startingOrder:
          highestOrder + 1,
      });

    const graded =
      await prisma.$transaction(
        async (tx) => {
          const now = new Date();

          if (uploadedObjects.length) {
            await Promise.all(
              uploadedObjects.map(
                (uploadedFile) =>
                  tx.correctedSubmissionFile.create({
                    data: {
                      submissionId,

                      objectKey:
                        uploadedFile.objectKey,

                      originalName:
                        uploadedFile.originalName,

                      contentType:
                        uploadedFile.contentType,

                      size:
                        uploadedFile.size,

                      order:
                        uploadedFile.order,

                      uploadedById:
                        uploadedFile.uploadedById,
                    },
                  }),
              ),
            );
          }

          const updatedSubmission =
            await tx.submission.update({
              where: {
                id: submissionId,
              },

              data: {
                grade: numericGrade,

                comments:
                  normalizedComments,
                  

                gradedAt: now,

                gradedById:
                  gradedBy.id,
              },
            });

          await tx.homeworkGradingHistory.create({
            data: {
              submissionId,

              action:
                wasPreviouslyGraded
                  ? "EDITED"
                  : "GRADED",

              previousGrade:
                previousGrade,

              newGrade:
                numericGrade,

              previousComments:
                previousComments,

              newComments:
                normalizedComments,

              previousGradedAt:
                previousGradedAt,

              newGradedAt:
                now,

              previousGradedById:
                previousGradedById,

              newGradedById:
                gradedBy.id,

              changedById:
                gradedBy.id,

              reason:
                wasPreviouslyGraded
                  ? "Grade or grading feedback updated."
                  : "Submission graded.",
            },
          });

          if (
            submission.delegation &&
            !submission.delegation.completedAt
          ) {
            await tx.delegation.update({
              where: {
                id:
                  submission
                    .delegation.id,
              },

              data: {
                completedAt: now,
              },
            });

            await tx
              .submissionDelegationHistory
              .create({
                data: {
                  submissionId,

                  delegationId:
                    submission
                      .delegation.id,

                  action: "COMPLETED",

                  fromAssistantId:
                    submission
                      .delegation
                      .assistantId,

                  toAssistantId:
                    submission
                      .delegation
                      .assistantId,

                  changedById:
                    gradedBy.id,

                  reason:
                    "Submission graded",
                },
              });
          }

          return tx.submission.findUnique({
            where: {
              id: updatedSubmission.id,
            },

            include: {
              student: {
                select: {
                  id: true,
                  name: true,
                },
              },

              files: {
                orderBy: {
                  order: "asc",
                },
              },

              correctedFiles: {
                include: {
                  uploadedBy: {
                    select: {
                      id: true,
                      name: true,
                    },
                  },
                },

                orderBy: {
                  order: "asc",
                },
              },

              gradedBy: {
                select: {
                  id: true,
                  name: true,
                  role: true,
                  isHeadAssistant: true,
                },
              },

              delegation: {
                include: {
                  assistant: {
                    select: {
                      id: true,
                      name: true,
                    },
                  },
                },
              },

              task: {
                select: {
                  id: true,
                  title: true,
                  deadline: true,
                  allowLateSubmission:
                    true,
                  gradeOutOf: true,
                },
              },
            },
          });
        },
      );

    notify({
      userId: submission.studentId,
      type: "GRADE_POSTED",
      title: "Your homework was graded",

      body:
        `You scored ${numericGrade}/${maximumGrade}`,

      link:
        `/my-tasks/${submission.taskId}`,
    }).catch((error) =>
      console.error(
        "notify() failed:",
        error.message,
      ),
    );

    return mapSubmission(graded);
  } catch (error) {
    await Promise.allSettled(
      uploadedObjects.map(
        (uploadedFile) =>
          storage.deleteFile(
            uploadedFile.objectKey,
          ),
      ),
    );

    throw error;
  }
}

async function reopenSubmission({
  submissionId,
  reason,
  requestedBy,
}) {
  assertCanReopenSubmission(
    requestedBy,
  );

  const submission =
    await prisma.submission.findUnique({
      where: {
        id: submissionId,
      },

      include: {
        student: {
          select: {
            id: true,
            name: true,
          },
        },

        task: {
          select: {
            id: true,
            title: true,
            gradeOutOf: true,
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
    throw createServiceError(
      404,
      "Submission not found",
    );
  }

  if (submission.grade === null) {
    throw createServiceError(
      409,
      "This submission is already open for grading.",
    );
  }

  const normalizedReason =
    normalizeOptionalText(reason) ||
    "Submission reopened for regrading.";

  const previousGrade =
    submission.grade;

  const previousComments =
    submission.comments || null;

  const previousGradedAt =
    submission.gradedAt || null;

  const previousGradedById =
    submission.gradedById || null;

  const reopened =
    await prisma.$transaction(
      async (tx) => {
        const updatedSubmission =
          await tx.submission.update({
            where: {
              id: submissionId,
            },

            data: {
              grade: null,
              comments: null,
              gradedAt: null,
              gradedById: null,
            },
          });

        await tx.homeworkGradingHistory.create({
          data: {
            submissionId,

            action: "REOPENED",

            previousGrade,

            newGrade: null,

            previousComments,

            newComments: null,

            previousGradedAt,

            newGradedAt: null,

            previousGradedById,

            newGradedById: null,

            changedById:
              requestedBy.id,

            reason:
              normalizedReason,
          },
        });

        if (submission.delegation) {
          await tx.delegation.update({
            where: {
              id:
                submission.delegation.id,
            },

            data: {
              completedAt: null,
            },
          });

          await tx
            .submissionDelegationHistory
            .create({
              data: {
                submissionId,

                delegationId:
                  submission.delegation.id,

                action: "REOPENED",

                fromAssistantId:
                  submission.delegation
                    .assistantId,

                toAssistantId:
                  submission.delegation
                    .assistantId,

                changedById:
                  requestedBy.id,

                reason:
                  normalizedReason,
              },
            });
        }

        return tx.submission.findUnique({
          where: {
            id:
              updatedSubmission.id,
          },

          include: {
            student: {
              select: {
                id: true,
                name: true,
              },
            },

            files: {
              orderBy: {
                order: "asc",
              },
            },

            correctedFiles: {
              include: {
                uploadedBy: {
                  select: {
                    id: true,
                    name: true,
                  },
                },
              },

              orderBy: {
                order: "asc",
              },
            },

            gradedBy: {
              select: {
                id: true,
                name: true,
                role: true,
                isHeadAssistant: true,
              },
            },

            delegation: {
              include: {
                assistant: {
                  select: {
                    id: true,
                    name: true,
                  },
                },
              },
            },

            task: {
              select: {
                id: true,
                title: true,
                deadline: true,
                allowLateSubmission: true,
                gradeOutOf: true,
              },
            },
          },
        });
      },
    );

  notify({
    userId:
      submission.studentId,

    type: "GENERAL",

    title:
      "Homework grade reopened",

    body:
      `${submission.task?.title || "Your homework"} was reopened for regrading.`,

    link:
      `/my-tasks/${submission.taskId}`,
  }).catch((error) =>
    console.error(
      "notify() failed:",
      error.message,
    ),
  );

  return mapSubmission(
    reopened,
  );
}

async function deleteCorrectedFile({
  submissionId,
  correctedFileId,
  requestedBy,
}) {
  if (!requestedBy) {
    throw createServiceError(
      401,
      "Unauthorized",
    );
  }

  const submission =
    await prisma.submission.findUnique({
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

        correctedFiles: {
          orderBy: {
            order: "asc",
          },
        },
      },
    });

  if (!submission) {
    throw createServiceError(
      404,
      "Submission not found",
    );
  }

  await assertCanGradeSubmission({
    submission,
    gradedBy: requestedBy,
  });

  const correctedFile =
    submission.correctedFiles.find(
      (file) =>
        file.id === correctedFileId,
    );

  if (!correctedFile) {
    throw createServiceError(
      404,
      "Corrected file not found",
    );
  }

  await prisma.$transaction(
    async (tx) => {
      await tx.correctedSubmissionFile.delete({
        where: {
          id: correctedFile.id,
        },
      });

      const remainingFiles =
        await tx.correctedSubmissionFile.findMany({
          where: {
            submissionId,
          },

          orderBy: {
            order: "asc",
          },
        });

      await Promise.all(
        remainingFiles.map(
          (file, index) =>
            tx.correctedSubmissionFile.update({
              where: {
                id: file.id,
              },

              data: {
                order: index,
              },
            }),
        ),
      );
    },
  );

  try {
    await storage.deleteFile(
      correctedFile.objectKey,
    );
  } catch (error) {
    console.error(
      "Failed to delete corrected file from R2:",
      error.message,
    );
  }

  return {
    deletedFileId: correctedFile.id,
  };
}

module.exports = {
  submitHomework,
  getMyHomeworkSubmission,
  deleteHomeworkFile,
  gradeSubmission,
  reopenSubmission,
  getGradingHistory,
  deleteCorrectedFile,
  mapSubmission,
};