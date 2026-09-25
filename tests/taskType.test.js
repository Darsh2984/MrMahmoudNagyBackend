const test = require("node:test");
const assert = require("node:assert/strict");
const {
  TASK_TYPES,
  normalizeTaskType,
} = require("../src/services/taskType.service");

test("defaults existing and omitted task types to Homework", () => {
  assert.equal(
    normalizeTaskType(undefined, TASK_TYPES.HOMEWORK),
    "HOMEWORK",
  );
});

test("accepts both supported task types", () => {
  assert.equal(normalizeTaskType("HOMEWORK"), "HOMEWORK");
  assert.equal(
    normalizeTaskType("in_class_quiz"),
    "IN_CLASS_QUIZ",
  );
});

test("rejects unsupported task types", () => {
  assert.throws(
    () => normalizeTaskType("QUIZ"),
    (error) =>
      error.status === 400 &&
      error.msg === "Task type must be Homework or In Class Quiz",
  );
});
