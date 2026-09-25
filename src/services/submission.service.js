const prisma = require("../config/prisma");
const storage = require("./storage.service");
const { notify } = require("./notification.service");
const { alertAdminsOfHomeworkSubmission } = require("./staffAlert.service");
const {
  autoDelegateSubmission,
  delegateSubmission,
} = require("./delegation.service");

const MAX_TOTAL_FILES = 20;
const MAX_CORRECTED_FILES = 20;
const MAX_HOMEWORK_FILE_SIZE =
  50 * 1024 * 1024;

const ALLOWED_HOMEWORK_MIME_TYPES =
  new Set([
    "application/pdf",
    "image/png",
    "image/jpeg",
    "image/jpg",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.ms-excel",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "application/vnd.ms-powerpoint",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    "text/plain",
  ]);

const HOMEWORK_TYPE_BY_EXTENSION = {
  ".pdf": "application/pdf",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".doc": "application/msword",
  ".docx":
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".xls": "application/vnd.ms-excel",
  ".xlsx":
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ".ppt": "application/vnd.ms-powerpoint",
  ".pptx":
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  ".txt": "text/plain",
};

function createServiceError(status, msg, data) {
  const error = new Error(msg);

  error.status = status;
  error.msg = msg;

  if (data !== undefined) {
    error.data = data;
  }

  return error;
}

function assertOnlineSubmission(submission) {
  if (submission?.submissionMethod === "HARDCOPY") {
    throw createServiceError(
      409,
      "This homework is already recorded as a hardcopy submission. Contact the teaching team if this needs to be changed.",
    );
  }
}

async function handleFirstSubmission(submissionId) {
  try {
    await autoDelegateSubmission({ submissionId });
  } catch (error) {
    // Upload success must not be rolled back by an automatic-assignment issue.
    // The submission remains visible to teacher/head assistant for delegation.
    console.error(
      "Automatic homework delegation failed:",
      error?.message || error,
    );
  }

  alertAdminsOfHomeworkSubmission(submissionId).catch((error) => {
    console.error(
      "Homework submission staff alert failed:",
      error?.message || error,
    );
  });
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

async function markHardcopySubmission({
  taskId,
  studentId,
  groupId,
  markedBy,
}) {
  if (!markedBy?.id || !["TEACHER", "ASSISTANT"].includes(markedBy.role)) {
    throw createServiceError(403, "Only teaching staff can record a hardcopy submission.");
  }

  const task = await prisma.task.findUnique({
    where: { id: taskId },
    select: {
      id: true,
      taskType: true,
      groups: { select: { groupId: true } },
    },
  });

  if (!task) {
    throw createServiceError(404, "Task not found.");
  }

  if (task.taskType !== "HOMEWORK") {
    throw createServiceError(400, "Hardcopy submission is available for homework tasks only.");
  }

  const student = await prisma.user.findUnique({
    where: { id: studentId },
    select: { id: true, role: true, name: true },
  });

  if (!student || student.role !== "STUDENT") {
    throw createServiceError(400, "Select a valid student.");
  }

  const taskGroupIds = task.groups.map(({ groupId: id }) => String(id));
  const memberships = await prisma.groupMembership.findMany({
    where: {
      studentId,
      groupId: { in: taskGroupIds },
    },
    select: { groupId: true },
  });
  const studentTaskGroupIds = [
    ...new Set(memberships.map(({ groupId: id }) => String(id))),
  ];

  if (!studentTaskGroupIds.length) {
    throw createServiceError(400, "This student is not assigned to a group for this task.");
  }

  const requestedGroupId = groupId ? String(groupId) : null;
  if (requestedGroupId && !studentTaskGroupIds.includes(requestedGroupId)) {
    throw createServiceError(400, "This student is not assigned to the selected task group.");
  }

  const isRegularAssistant =
    markedBy.role === "ASSISTANT" && markedBy.isHeadAssistant !== true;
  let resolvedGroupId = requestedGroupId || studentTaskGroupIds[0];

  if (isRegularAssistant) {
    const assignments = await prisma.assistantGroupAssignment.findMany({
      where: {
        assistantId: markedBy.id,
        groupId: { in: studentTaskGroupIds },
      },
      select: { groupId: true },
    });
    const assignedGroupIds = assignments.map(({ groupId: id }) => String(id));

    if (requestedGroupId && !assignedGroupIds.includes(requestedGroupId)) {
      throw createServiceError(403, "You are not assigned to this student's task group.");
    }

    if (!requestedGroupId) {
      resolvedGroupId = assignedGroupIds[0];
    }

    if (!resolvedGroupId) {
      throw createServiceError(403, "You are not assigned to this student's task group.");
    }
  }

  const existing = await prisma.submission.findUnique({
    where: { taskId_studentId: { taskId, studentId } },
    select: { id: true, submissionMethod: true },
  });

  if (existing) {
    throw createServiceError(
      409,
      existing.submissionMethod === "HARDCOPY"
        ? "This student is already marked as having submitted a hardcopy."
        : "This student already has an online submission for this task.",
    );
  }

  const now = new Date();
  let created;

  try {
    created = await prisma.submission.create({
      data: {
        taskId,
        studentId,
        submissionMethod: "HARDCOPY",
        hardcopyMarkedAt: now,
        hardcopyMarkedById: markedBy.id,
        firstSubmittedAt: now,
        submittedAt: now,
        lastModifiedAt: now,
        lastModifiedAfterDeadline: false,
      },
      select: { id: true },
    });

    if (isRegularAssistant) {
      await delegateSubmission({
        submissionId: created.id,
        assistantId: markedBy.id,
        delegatedById: markedBy.id,
        groupId: resolvedGroupId,
        reason: "Assistant received and recorded the student's hardcopy submission.",
        skipNotification: true,
      });
    } else {
      await autoDelegateSubmission({ submissionId: created.id });
    }
  } catch (error) {
    if (created?.id) {
      await prisma.submission.delete({ where: { id: created.id } }).catch(() => {});
    }
    if (error?.code === "P2002") {
      throw createServiceError(409, "This student already has a submission for this task.");
    }
    throw error;
  }

  return mapSubmission(await findStudentSubmission({ taskId, studentId }));
}

function getHomeworkUploadPrefix(
  taskId,
  studentId,
) {
  return `homework-direct/${taskId}/${studentId}/`;
}

function normalizeDirectUploadFile(
  file,
  index,
) {
  const clientId = String(
    file?.clientId || `file-${index + 1}`,
  ).trim();

  const originalName = String(
    file?.name || "",
  ).trim();

  const size = Number(file?.size);

  const extensionMatch =
    originalName
      .toLowerCase()
      .match(/\.[a-z0-9]+$/);

  const inferredType =
    HOMEWORK_TYPE_BY_EXTENSION[
      extensionMatch?.[0]
    ];

  const requestedType = String(
    file?.contentType || "",
  )
    .trim()
    .toLowerCase();

  const contentType =
    ALLOWED_HOMEWORK_MIME_TYPES.has(
      requestedType,
    )
      ? requestedType
      : inferredType;

  if (!clientId || !originalName) {
    throw createServiceError(
      400,
      "Every selected homework file must have a name.",
    );
  }

  if (!contentType) {
    throw createServiceError(
      400,
      `Unsupported homework file type: ${originalName}.`,
    );
  }

  if (
    !Number.isFinite(size) ||
    size <= 0 ||
    size > MAX_HOMEWORK_FILE_SIZE
  ) {
    throw createServiceError(
      400,
      `${originalName} must be larger than 0 bytes and no more than 50 MB.`,
    );
  }

  return {
    clientId,
    originalName,
    contentType,
    size,
  };
}

function normalizeDirectUploadFiles(files) {
  if (
    !Array.isArray(files) ||
    !files.length
  ) {
    throw createServiceError(
      400,
      "Select at least one homework file.",
    );
  }

  if (files.length > MAX_TOTAL_FILES) {
    throw createServiceError(
      400,
      `You can prepare a maximum of ${MAX_TOTAL_FILES} files at once.`,
    );
  }

  const normalized = files.map(
    normalizeDirectUploadFile,
  );

  if (
    new Set(
      normalized.map((file) => file.clientId),
    ).size !== normalized.length
  ) {
    throw createServiceError(
      400,
      "Each selected file must have a unique client ID.",
    );
  }

  return normalized;
}

function normalizeScopedObjectKeys({
  uploads,
  taskId,
  studentId,
}) {
  if (
    !Array.isArray(uploads) ||
    !uploads.length ||
    uploads.length > MAX_TOTAL_FILES
  ) {
    throw createServiceError(
      400,
      `Provide between 1 and ${MAX_TOTAL_FILES} uploaded files.`,
    );
  }

  const requiredPrefix =
    getHomeworkUploadPrefix(
      taskId,
      studentId,
    );

  const normalized = uploads.map(
    (upload, index) => {
      const objectKey =
        storage.normalizeObjectKey(
          upload?.objectKey,
        );

      if (
        !objectKey.startsWith(
          requiredPrefix,
        )
      ) {
        throw createServiceError(
          403,
          "This uploaded file does not belong to the current student and task.",
        );
      }

      return {
        clientId: String(
          upload?.clientId ||
            `file-${index + 1}`,
        ).trim(),
        objectKey,
      };
    },
  );

  if (
    new Set(
      normalized.map(
        (upload) => upload.objectKey,
      ),
    ).size !== normalized.length
  ) {
    throw createServiceError(
      400,
      "The same uploaded file cannot be confirmed twice.",
    );
  }

  return normalized;
}

async function prepareHomeworkUploads({
  taskId,
  studentId,
  files,
}) {
  const normalizedFiles =
    normalizeDirectUploadFiles(files);

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

  const submission =
    await findStudentSubmission({
      taskId,
      studentId,
    });

  assertOnlineSubmission(submission);

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
    existingFileCount +
      normalizedFiles.length >
    MAX_TOTAL_FILES
  ) {
    throw createServiceError(
      400,
      `A homework submission may contain a maximum of ${MAX_TOTAL_FILES} files.`,
      {
        existingFileCount,
        selectedFileCount:
          normalizedFiles.length,
      },
    );
  }

  const folder =
    `homework-direct/${taskId}/${studentId}`;

  return Promise.all(
    normalizedFiles.map(async (file) => {
      const objectName =
        storage.createObjectKey(
          file.originalName,
          folder,
        );

      const signed =
        await storage.createPresignedUploadUrl({
          objectName,
          originalFilename:
            file.originalName,
          contentType:
            file.contentType,
          expiresInMinutes: 30,
        });

      return {
        clientId: file.clientId,
        objectKey: signed.objectName,
        uploadUrl: signed.uploadUrl,
        expiresInSeconds:
          signed.expiresInSeconds,
        contentType:
          signed.contentType,
        method: "PUT",
        headers: {
          "Content-Type":
            signed.contentType,
        },
      };
    }),
  );
}

async function confirmHomeworkUploads({
  taskId,
  studentId,
  uploads,
}) {
  const normalizedUploads =
    normalizeScopedObjectKeys({
      uploads,
      taskId,
      studentId,
    });

  const task = await getTaskForStudent({
    taskId,
    studentId,
  });

  let submission =
    await findStudentSubmission({
      taskId,
      studentId,
    });
  assertOnlineSubmission(submission);
  const isFirstSubmission = !submission;

  if (
    submission &&
    submission.grade !== null
  ) {
    throw createServiceError(
      409,
      "This homework has already been graded and can no longer be modified.",
    );
  }

  const existingByKey = new Map(
    (submission?.files || []).map(
      (file) => [file.objectKey, file],
    ),
  );

  const newUploads =
    normalizedUploads.filter(
      (upload) =>
        !existingByKey.has(
          upload.objectKey,
        ),
    );

  if (!newUploads.length) {
    return {
      submission:
        await mapSubmission(submission),
      confirmedFiles: [],
    };
  }

  if (
    (submission?.files?.length || 0) +
      newUploads.length >
    MAX_TOTAL_FILES
  ) {
    throw createServiceError(
      400,
      `A homework submission may contain a maximum of ${MAX_TOTAL_FILES} files.`,
    );
  }

  const claimedElsewhere =
    await prisma.submissionFile.findMany({
      where: {
        objectKey: {
          in: newUploads.map(
            (upload) => upload.objectKey,
          ),
        },
      },
      select: {
        objectKey: true,
      },
    });

  if (claimedElsewhere.length) {
    throw createServiceError(
      409,
      "One or more uploaded files were already confirmed.",
    );
  }

  const verifiedFiles =
    await Promise.all(
      newUploads.map(async (upload) => {
        const metadata =
          await storage.getFileMetadata(
            upload.objectKey,
          );

        const validated =
          normalizeDirectUploadFile(
          {
            clientId: upload.clientId,
            name:
              metadata.originalName ||
              "homework-file",
            contentType:
              metadata.contentType,
            size: metadata.size,
          },
          0,
        );

        return {
          ...upload,
          originalName:
            validated.originalName,
          contentType:
            validated.contentType,
          size: validated.size,
          uploadedAt:
            metadata.lastModified ||
            new Date(),
        };
      }),
    );

  for (const file of verifiedFiles) {
    const fileState =
      getModificationState(
        task,
        new Date(file.uploadedAt),
      );

    if (!fileState.allowed) {
      await Promise.allSettled(
        verifiedFiles.map((item) =>
          storage.deleteFile(
            item.objectKey,
          ),
        ),
      );

      throw createServiceError(
        400,
        fileState.message,
      );
    }

    file.uploadedAfterDeadline =
      fileState.afterDeadline;
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

  const latestUploadAt = new Date(
    Math.max(
      ...verifiedFiles.map((file) =>
        new Date(file.uploadedAt).getTime(),
      ),
    ),
  );

  const firstUploadAt = new Date(
    Math.min(
      ...verifiedFiles.map((file) =>
        new Date(file.uploadedAt).getTime(),
      ),
    ),
  );

  try {
    submission = await prisma.$transaction(
      async (tx) => {
        let currentSubmission = submission;

        if (!currentSubmission) {
          currentSubmission =
            await tx.submission.create({
              data: {
                taskId,
                studentId,
                firstSubmittedAt:
                  firstUploadAt,
                submittedAt:
                  latestUploadAt,
                lastModifiedAt:
                  latestUploadAt,
                lastModifiedAfterDeadline:
                  verifiedFiles.some(
                    (file) =>
                      file.uploadedAfterDeadline,
                  ),
              },
            });
        } else {
          currentSubmission =
            await tx.submission.update({
              where: {
                id: currentSubmission.id,
              },
              data: {
                submittedAt:
                  latestUploadAt,
                lastModifiedAt:
                  latestUploadAt,
                lastModifiedAfterDeadline:
                  currentSubmission
                    .lastModifiedAfterDeadline ||
                  verifiedFiles.some(
                    (file) =>
                      file.uploadedAfterDeadline,
                  ),
              },
            });
        }

        await Promise.all(
          verifiedFiles.map(
            (file, index) =>
              tx.submissionFile.create({
                data: {
                  submissionId:
                    currentSubmission.id,
                  objectKey:
                    file.objectKey,
                  originalName:
                    file.originalName,
                  contentType:
                    file.contentType,
                  size: file.size,
                  order:
                    highestExistingOrder +
                    index +
                    1,
                  uploadedAfterDeadline:
                    file.uploadedAfterDeadline,
                  uploadedAt:
                    file.uploadedAt,
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
      verifiedFiles.map((file) =>
        storage.deleteFile(
          file.objectKey,
        ),
      ),
    );
    throw error;
  }

  if (isFirstSubmission) {
    await handleFirstSubmission(submission.id);
  }

  return {
    submission:
      await mapSubmission(submission),
    confirmedFiles:
      verifiedFiles.map((file) => ({
        name: file.originalName,
        contentType:
          file.contentType,
        size: file.size,
      })),
  };
}

async function abortHomeworkUploads({
  taskId,
  studentId,
  objectKeys,
}) {
  await getTaskForStudent({
    taskId,
    studentId,
  });

  if (!Array.isArray(objectKeys)) {
    throw createServiceError(
      400,
      "Uploaded file keys are required.",
    );
  }

  const uploads = objectKeys.length
    ? normalizeScopedObjectKeys({
        uploads: objectKeys.map(
          (objectKey) => ({ objectKey }),
        ),
        taskId,
        studentId,
      })
    : [];

  if (!uploads.length) {
    return { removedCount: 0 };
  }

  const confirmed =
    await prisma.submissionFile.findMany({
      where: {
        objectKey: {
          in: uploads.map(
            (upload) => upload.objectKey,
          ),
        },
      },
      select: {
        objectKey: true,
      },
    });

  const confirmedKeys = new Set(
    confirmed.map((file) => file.objectKey),
  );

  const removable = uploads.filter(
    (upload) =>
      !confirmedKeys.has(upload.objectKey),
  );

  await Promise.allSettled(
    removable.map((upload) =>
      storage.deleteFile(upload.objectKey),
    ),
  );

  return {
    removedCount: removable.length,
  };
}

async function cleanupAbandonedHomeworkUploads({
  olderThanHours = 24,
} = {}) {
  const cutoff =
    Date.now() -
    Math.max(
      1,
      Number(olderThanHours) || 24,
    ) *
      60 *
      60 *
      1000;

  const storedObjects =
    await storage.listObjects(
      "homework-direct/",
    );

  const candidates = storedObjects.filter(
    (object) => {
      const modifiedAt = new Date(
        object.lastModified,
      ).getTime();

      return (
        Number.isFinite(modifiedAt) &&
        modifiedAt < cutoff
      );
    },
  );

  if (!candidates.length) {
    return { removedCount: 0 };
  }

  const confirmedKeys = new Set();

  for (
    let index = 0;
    index < candidates.length;
    index += 200
  ) {
    const chunk = candidates.slice(
      index,
      index + 200,
    );

    const confirmed =
      await prisma.submissionFile.findMany({
        where: {
          objectKey: {
            in: chunk.map(
              (item) => item.objectKey,
            ),
          },
        },
        select: {
          objectKey: true,
        },
      });

    confirmed.forEach((file) =>
      confirmedKeys.add(file.objectKey),
    );
  }

  const abandoned = candidates.filter(
    (item) =>
      !confirmedKeys.has(item.objectKey),
  );

  await Promise.allSettled(
    abandoned.map((item) =>
      storage.deleteFile(item.objectKey),
    ),
  );

  return {
    removedCount: abandoned.length,
  };
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
  assertOnlineSubmission(submission);
  const isFirstSubmission = !submission;

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

  if (isFirstSubmission) {
    await handleFirstSubmission(submission.id);
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
  markHardcopySubmission,
  submitHomework,
  prepareHomeworkUploads,
  confirmHomeworkUploads,
  abortHomeworkUploads,
  cleanupAbandonedHomeworkUploads,
  getMyHomeworkSubmission,
  deleteHomeworkFile,
  gradeSubmission,
  reopenSubmission,
  getGradingHistory,
  deleteCorrectedFile,
  mapSubmission,
};
