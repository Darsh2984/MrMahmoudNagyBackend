const test = require("node:test");
const assert = require("node:assert/strict");

const {
  getSubmissionFlagStatus,
} = require("../src/services/taskFlagging.service");

test("flags a graded homework submission below 60 percent", () => {
  assert.deepEqual(
    getSubmissionFlagStatus(29, 50),
    {
      gradePercentage: 58,
      isFlagged: true,
    },
  );
});

test("does not flag a submission at or above 60 percent", () => {
  assert.equal(
    getSubmissionFlagStatus(30, 50).isFlagged,
    false,
  );

  assert.equal(
    getSubmissionFlagStatus(42, 50).isFlagged,
    false,
  );
});

test("does not flag an ungraded submission or an invalid maximum grade", () => {
  assert.deepEqual(
    getSubmissionFlagStatus(null, 50),
    {
      gradePercentage: null,
      isFlagged: false,
    },
  );

  assert.equal(
    getSubmissionFlagStatus(0, 0).isFlagged,
    false,
  );
});
