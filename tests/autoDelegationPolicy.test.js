const test = require("node:test");
const assert = require("node:assert/strict");
const {
  evaluateAssistantAssignments,
} = require("../src/services/autoDelegationPolicy.service");

function assignment(id, permissions = { canGradeHomework: true }) {
  return {
    assistant: {
      id,
      role: "ASSISTANT",
      isHeadAssistant: false,
      permissions,
    },
  };
}

test("automatically selects the only assigned grading assistant", () => {
  const result = evaluateAssistantAssignments([assignment("assistant-1")]);

  assert.equal(result.assistant.id, "assistant-1");
  assert.equal(result.reason, null);
});

test("does not automatically select when more than one assistant is assigned", () => {
  const result = evaluateAssistantAssignments([
    assignment("assistant-1"),
    assignment("assistant-2"),
  ]);

  assert.equal(result.assistant, null);
  assert.equal(result.reason, "MULTIPLE_ASSISTANTS");
});

test("does not automatically select when no assistant is assigned", () => {
  const result = evaluateAssistantAssignments([]);

  assert.equal(result.assistant, null);
  assert.equal(result.reason, "NO_ASSISTANT");
});

test("does not assign an assistant who cannot grade homework", () => {
  const result = evaluateAssistantAssignments([
    assignment("assistant-1", {}),
  ]);

  assert.equal(result.assistant, null);
  assert.equal(result.reason, "ASSISTANT_CANNOT_GRADE_HOMEWORK");
});

test("a single assigned head assistant is eligible", () => {
  const result = evaluateAssistantAssignments([
    {
      assistant: {
        id: "head-1",
        role: "ASSISTANT",
        isHeadAssistant: true,
        permissions: {},
      },
    },
  ]);

  assert.equal(result.assistant.id, "head-1");
});
