const test = require("node:test");
const assert = require("node:assert/strict");

let currentSubmission;
let assistantCanAccessSubmission = true;
let assistantAssignedToGroup = true;
let deletedSubmissionIds = [];
let deletedMemberships = [];
let deletedObjectKeys = [];

const task = {
  id: "task-1",
  deadline: new Date(Date.now() + 60 * 60 * 1000),
  allowLateSubmission: false,
  groups: [{ groupId: "group-a" }, { groupId: "group-b" }],
};

function buildSubmission(overrides = {}) {
  return {
    id: "submission-1",
    taskId: task.id,
    studentId: "student-1",
    submissionMethod: "ONLINE",
    grade: null,
    fileUrl: "legacy/original.pdf",
    correctedFileUrl: null,
    files: [{ objectKey: "answers/page-1.jpg" }],
    correctedFiles: [],
    gradingHistory: [],
    task,
    ...overrides,
  };
}

const prisma = {
  submission: {
    findUnique: async () => currentSubmission,
    delete: async ({ where }) => {
      deletedSubmissionIds.push(where.id);
      return currentSubmission;
    },
  },
  task: {
    findUnique: async () => task,
  },
  groupMembership: {
    count: async () => 1,
    findFirst: async () =>
      assistantCanAccessSubmission ? { groupId: "group-a" } : null,
    findUnique: async () => ({ id: "membership-1" }),
    delete: async ({ where }) => {
      deletedMemberships.push(where.groupId_studentId);
      return { id: "membership-1" };
    },
  },
  assistantGroupAssignment: {
    findUnique: async () =>
      assistantAssignedToGroup ? { id: "assignment-1" } : null,
  },
};

function mock(path, exports) {
  const id = require.resolve(path);
  require.cache[id] = {
    id,
    filename: id,
    loaded: true,
    exports,
  };
}

mock("../src/config/prisma", prisma);
mock("../src/services/storage.service", {
  deleteFile: async (objectKey) => {
    deletedObjectKeys.push(objectKey);
  },
});
mock("../src/services/notification.service", { notify: async () => {} });
mock("../src/services/staffAlert.service", {
  alertAdminsOfHomeworkSubmission: async () => {},
});
mock("../src/services/delegation.service", {
  autoDelegateSubmission: async () => {},
  delegateSubmission: async () => {},
});

const submissionService = require("../src/services/submission.service");
const groupService = require("../src/services/group.service");

test("submission and group removal permissions", async (t) => {
  await t.test("a student can remove their own editable submission and its stored files", async () => {
    currentSubmission = buildSubmission();
    deletedSubmissionIds = [];
    deletedObjectKeys = [];

    await submissionService.deleteSubmission({
      submissionId: currentSubmission.id,
      requestedBy: { id: "student-1", role: "STUDENT" },
    });

    assert.deepEqual(deletedSubmissionIds, ["submission-1"]);
    assert.deepEqual(
      new Set(deletedObjectKeys),
      new Set(["legacy/original.pdf", "answers/page-1.jpg"]),
    );
  });

  await t.test("a student cannot remove another student's or a graded submission", async () => {
    currentSubmission = buildSubmission();

    await assert.rejects(
      submissionService.deleteSubmission({
        submissionId: currentSubmission.id,
        requestedBy: { id: "student-2", role: "STUDENT" },
      }),
      (error) => error.status === 403,
    );

    currentSubmission = buildSubmission({ grade: 18 });
    await assert.rejects(
      submissionService.deleteSubmission({
        submissionId: currentSubmission.id,
        requestedBy: { id: "student-1", role: "STUDENT" },
      }),
      (error) => error.status === 409,
    );
  });

  await t.test("an assistant assigned to the student's task group can remove the submission", async () => {
    currentSubmission = buildSubmission({ grade: 18 });
    assistantCanAccessSubmission = true;
    deletedSubmissionIds = [];

    await submissionService.deleteSubmission({
      submissionId: currentSubmission.id,
      requestedBy: { id: "assistant-a", role: "ASSISTANT" },
    });

    assert.deepEqual(deletedSubmissionIds, ["submission-1"]);
  });

  await t.test("an unassigned assistant cannot remove the submission", async () => {
    currentSubmission = buildSubmission();
    assistantCanAccessSubmission = false;

    await assert.rejects(
      submissionService.deleteSubmission({
        submissionId: currentSubmission.id,
        requestedBy: { id: "assistant-x", role: "ASSISTANT" },
      }),
      (error) => error.status === 403,
    );
  });

  await t.test("an assigned assistant can remove a student from their group", async () => {
    assistantAssignedToGroup = true;
    deletedMemberships = [];

    await groupService.removeStudentFromGroup({
      groupId: "group-a",
      studentId: "student-1",
      viewer: { id: "assistant-a", role: "ASSISTANT" },
    });

    assert.deepEqual(deletedMemberships, [
      { groupId: "group-a", studentId: "student-1" },
    ]);
  });

  await t.test("an assistant cannot remove a student from an unassigned group", async () => {
    assistantAssignedToGroup = false;

    await assert.rejects(
      groupService.removeStudentFromGroup({
        groupId: "group-b",
        studentId: "student-1",
        viewer: { id: "assistant-a", role: "ASSISTANT" },
      }),
      (error) => error.status === 403,
    );
  });
});
