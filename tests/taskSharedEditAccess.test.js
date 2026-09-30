const test = require("node:test");
const assert = require("node:assert/strict");

let assignmentCount = 1;
let lastAssignmentQuery = null;
let lastUpdateArgs = null;

const sharedTask = {
  id: "task-shared",
  taskFileUrl: null,
  groups: [
    { groupId: "group-a" },
    { groupId: "group-b" },
    { groupId: "group-c" },
  ],
};

const prisma = {
  task: {
    findUnique: async () => sharedTask,
  },
  assistantGroupAssignment: {
    count: async (args) => {
      lastAssignmentQuery = args;
      return assignmentCount;
    },
  },
  $transaction: async (operation) =>
    operation({
      task: {
        update: async (args) => {
          lastUpdateArgs = args;
          return { ...sharedTask, ...args.data };
        },
      },
    }),
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
mock("../src/services/storage.service", {});

const taskService = require("../src/services/task.service");

const assistant = {
  id: "assistant-a",
  role: "ASSISTANT",
  isHeadAssistant: false,
};

test("an assistant assigned to one group can edit a task shared across several groups", async () => {
  assignmentCount = 1;
  lastAssignmentQuery = null;
  lastUpdateArgs = null;

  await taskService.updateTask(
    sharedTask.id,
    {
      title: "Updated for every assigned group",
      groupIds: ["group-c", "group-a", "group-b"],
    },
    assistant,
  );

  assert.deepEqual(
    lastAssignmentQuery.where.groupId.in,
    ["group-a", "group-b", "group-c"],
  );
  assert.equal(lastUpdateArgs.data.title, "Updated for every assigned group");
  assert.equal(lastUpdateArgs.data.groups, undefined);
});

test("an assistant with no assignment to the shared task cannot edit it", async () => {
  assignmentCount = 0;

  await assert.rejects(
    taskService.updateTask(
      sharedTask.id,
      { title: "Not allowed" },
      assistant,
    ),
    (error) => error.status === 403,
  );
});

test("a regular assistant cannot change the groups of a shared task", async () => {
  assignmentCount = 1;

  await assert.rejects(
    taskService.updateTask(
      sharedTask.id,
      {
        title: "Details are valid",
        groupIds: ["group-a"],
      },
      assistant,
    ),
    (error) =>
      error.status === 403 &&
      /only the teacher or head assistant/i.test(error.msg),
  );
});

test("teachers can still change the groups assigned to a task", async () => {
  lastUpdateArgs = null;

  await taskService.updateTask(
    sharedTask.id,
    { groupIds: ["group-a", "group-d"] },
    { id: "teacher", role: "TEACHER" },
  );

  assert.deepEqual(lastUpdateArgs.data.groups, {
    deleteMany: {},
    create: [
      { groupId: "group-a" },
      { groupId: "group-d" },
    ],
  });
});
