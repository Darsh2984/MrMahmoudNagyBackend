const test = require("node:test");
const assert = require("node:assert/strict");
const { validateRubric, validateCorrection } = require("../src/services/taskAIGrading.validation");
const { answerMimeType, detectAnswerMimeType } = require("../src/services/taskAIGrading.media");

test("PDF/image detection normalizes JPG MIME and checks stored bytes", () => {
  assert.equal(answerMimeType({ contentType: "image/jpg" }), "image/jpeg");
  assert.equal(answerMimeType({ name: "PAGE.PNG", contentType: "application/octet-stream" }), "image/png");
  assert.equal(answerMimeType({ name: "answer.docx" }), null);
  assert.equal(detectAnswerMimeType(Buffer.from("%PDF-1.7 test")), "application/pdf");
  assert.equal(detectAnswerMimeType(Buffer.from([255, 216, 255, 224])), "image/jpeg");
  const png = Buffer.alloc(24);
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).copy(png);
  assert.equal(detectAnswerMimeType(png), "image/png");
  assert.throws(() => detectAnswerMimeType(Buffer.from("fake renamed image")));
});

function question(label, marks) {
  return { question: label, possible: marks, questionText: "Explain the observation", markingPoints: ["Correct explanation: 1 mark"], acceptedAnswers: [], commonErrors: [], references: "Scheme page 1", uncertainties: [] };
}
function answer(label, marks) {
  return { question: label, awarded: marks, studentAnswer: "Student's actual explanation", pageReferences: ["answer.pdf page 1"], awardedFor: ["Correct observation"], deductedFor: ["Missing explanation"], feedback: "Explain the cause", needsTeacherReview: false };
}
const rubric = validateRubric({ questions: [question("1(a)", 2), question("1(b)", 3)], documentWarnings: [] });
const result = () => ({ summary: "Partial understanding", overallFeedback: "Work on explanations", teacherNotes: "Verify handwriting", strengths: [], weaknesses: [], questionBreakdown: [answer("1(a)", 1), answer("1(b)", 2)] });
test("totals are calculated from authoritative rubric and validated per-question marks", () => {
  const correction = validateCorrection({ ...result(), totalAwarded: 999, totalPossible: 999 }, rubric);
  assert.equal(correction.totalAwarded, 3);
  assert.equal(correction.totalPossible, 5);
  assert.equal(correction.percentage, 60);
});
test("missing, duplicate and unknown questions cannot become saved corrections", () => {
  assert.throws(() => validateCorrection({ ...result(), questionBreakdown: [answer("1(a)", 1)] }, rubric));
  assert.throws(() => validateCorrection({ ...result(), questionBreakdown: [answer("1(a)", 1), answer("1(a)", 1)] }, rubric));
  assert.throws(() => validateCorrection({ ...result(), questionBreakdown: [answer("1(a)", 1), answer("unknown", 1)] }, rubric));
});
test("negative, excessive, nonnumeric and nonfinite marks are rejected", () => {
  for (const marks of [-1, 9, "1", NaN, Infinity]) {
    assert.throws(() => validateCorrection({ ...result(), questionBreakdown: [answer("1(a)", marks), answer("1(b)", 2)] }, rubric));
  }
});
test("uncertain rubric questions always require staff review", () => {
  const uncertain = validateRubric({ questions: [{ ...question("1", 2), uncertainties: ["Diagram unreadable"] }], documentWarnings: [] });
  assert.equal(validateCorrection({ ...result(), questionBreakdown: [answer("1", 1)] }, uncertain).questionBreakdown[0].needsTeacherReview, true);
});
test("rubric rejects duplicate labels and empty/invalid scoring", () => {
  assert.throws(() => validateRubric({ questions: [question("1", 2), question("1", 2)], documentWarnings: [] }));
  assert.throws(() => validateRubric({ questions: [question("1", -1)], documentWarnings: [] }));
  assert.throws(() => validateRubric({ questions: [], documentWarnings: [] }));
});

// Stub persistence and storage: no database, R2 requests, or paid AI calls in these tests.
let assigned = 1;
let delegation = { assistantId: "assistant" };
let activePack = { id: "pack", taskId: "task", status: "READY", approvedAt: new Date(), activatedAt: new Date(), rubric };
const submission = () => ({ id: "submission", taskId: "task", files: [
  { id: "answer", objectKey: "private/answer.pdf", originalName: "answer.pdf", contentType: "application/pdf", size: 10, uploadedAt: new Date("2026-09-18T10:00:00Z") },
], delegation });
let savedCorrections = [];
let extraFiles = [];
let reviewCorrection = null;
const prisma = {
  task: { findUnique: async () => ({ id: "task", teacherId: "teacher", groups: [{ groupId: "group" }] }) },
  assistantGroupAssignment: { count: async () => assigned },
  submission: { findUnique: async () => ({ ...submission(), files: [...submission().files, ...extraFiles] }) },
  taskAIGradingPack: { updateMany: async () => ({ count: 0 }), findFirst: async () => activePack },
  submissionAICorrection: {
    updateMany: async () => ({ count: 0 }), findMany: async () => savedCorrections,
    create: async () => { throw Object.assign(new Error("Existing"), { code: "P2002" }); },
    findUnique: async () => savedCorrections[0],
    findFirst: async () => reviewCorrection,
    update: async ({ data }) => Object.assign(reviewCorrection, data),
  },
};
function mock(path, exports) {
  const id = require.resolve(path);
  require.cache[id] = { id, filename: id, loaded: true, exports };
}
mock("../src/config/prisma", prisma);
mock("../src/services/storage.service", { getSignedUrl: async () => "signed-staff-only-url" });
const service = require("../src/services/taskAIGrading.service");
const assistant = { id: "assistant", name: "Assistant", role: "ASSISTANT" };
test("students are blocked while teachers and head assistants can access every task", async () => {
  await assert.rejects(service.assertTaskAccess("task", { id: "student", role: "STUDENT" }), error => error.status === 403);
  await assert.doesNotReject(service.assertTaskAccess("task", { id: "main-teacher", role: "TEACHER" }));
  await assert.doesNotReject(service.assertTaskAccess("task", { id: "head", role: "ASSISTANT", isHeadAssistant: true }));
});
test("regular assistants require group assignment and submission delegation", async () => {
  assigned = 0;
  await assert.rejects(service.listCorrections("submission", assistant), error => error.status === 403);
  assigned = 1;
  delegation = null;
  await assert.rejects(service.listCorrections("submission", assistant), error => error.status === 403);
  delegation = { assistantId: "assistant" };
});
test("saved results are private, hide R2 keys, and detect changed references/answers", async () => {
  savedCorrections = [{ id: "correction", packId: "old-pack", status: "COMPLETED", submissionVersion: "old-version", inputFiles: [{ id: "answer", name: "answer.pdf", objectKey: "private/key" }], result: validateCorrection(result(), rubric) }];
  const data = await service.listCorrections("submission", assistant);
  assert.equal(data.corrections[0].stale, true);
  assert.equal(data.corrections[0].inputFiles[0].objectKey, undefined);
  assert.equal(data.files[0].objectKey, undefined);
  await assert.rejects(service.listCorrections("submission", { id: "student", role: "STUDENT" }), error => error.status === 403);
});
test("approved rubric required, foreign/duplicate file IDs rejected, completed results reused", async () => {
  const oldKey = process.env.GEMINI_API_KEY;
  process.env.GEMINI_API_KEY = "test-placeholder-not-used";
  try {
    activePack.approvedAt = null;
    await assert.rejects(service.startCorrection("submission", assistant, ["answer"]), error => error.status === 409);
    activePack.approvedAt = new Date();
    await assert.rejects(service.startCorrection("submission", assistant, ["someone-elses-file"]), error => error.status === 400);
    await assert.rejects(service.startCorrection("submission", assistant, ["answer", "answer"]), error => error.status === 400);
    savedCorrections = [{ id: "existing", packId: "pack", status: "COMPLETED", createdAt: new Date(), submissionVersion: service.submissionVersion(submission()), inputFiles: [{ id: "answer", name: "answer.pdf", objectKey: "private/key" }] }];
    const reused = await service.startCorrection("submission", assistant, ["answer"]);
    assert.equal(reused.correctionId, "existing");
    assert.equal(reused.corrections[0].stale, false);
    // No grade update method, notifications or Gemini client exists in the stubs.
  } finally {
    if (oldKey === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = oldKey;
  }
});

test("mixed multi-file submissions list PDFs and images but exclude Office files; accept 20 files", async () => {
  const oldKey = process.env.GEMINI_API_KEY;
  process.env.GEMINI_API_KEY = "test-placeholder-not-used";
  extraFiles = Array.from({ length: 19 }, (_, index) => ({
    id: `image-${index}`, objectKey: `private/page-${index}.jpg`, originalName: `page-${index}.jpg`,
    contentType: "image/jpg", size: 10, uploadedAt: new Date("2026-09-18T10:00:00Z"),
  }));
  extraFiles.push({ id: "office", originalName: "notes.docx", objectKey: "private/notes", contentType: "application/msword" });
  try {
    const data = await service.listCorrections("submission", assistant);
    assert.equal(data.files.length, 20);
    assert.equal(data.files.some(file => file.id === "office"), false);
    const ids = data.files.map(file => file.id);
    const correction = await service.startCorrection("submission", assistant, ids);
    assert.equal(correction.correctionId, "existing");
    await assert.rejects(service.startCorrection("submission", assistant, ["office"]), error => error.status === 400);
    await assert.rejects(service.startCorrection("submission", assistant, [...ids, "office"]), error => error.status === 400);
  } finally {
    extraFiles = [];
    if (oldKey === undefined) delete process.env.GEMINI_API_KEY;
    else process.env.GEMINI_API_KEY = oldKey;
  }
});

test("staff can edit, confirm, lock and reopen a completed AI correction", async () => {
  reviewCorrection = {
    id: "review",
    submissionId: "submission",
    packId: "pack",
    pack: activePack,
    status: "COMPLETED",
    result: validateCorrection(result(), rubric),
    inputFiles: [],
    submissionVersion: service.submissionVersion(submission()),
    createdAt: new Date(),
    completedAt: new Date(),
  };
  savedCorrections = [reviewCorrection];
  const edited = result();
  edited.questionBreakdown[0].awarded = 2;
  await service.saveCorrectionReview("submission", "review", assistant, edited);
  assert.equal(reviewCorrection.reviewedResult.totalAwarded, 4);
  assert.equal(reviewCorrection.reviewedByName, "Assistant");
  await service.confirmCorrectionReview("submission", "review", assistant);
  assert.ok(reviewCorrection.confirmedAt);
  assert.equal(reviewCorrection.confirmedByName, "Assistant");
  await assert.rejects(
    service.saveCorrectionReview("submission", "review", assistant, edited),
    error => error.status === 409,
  );
  await service.reopenCorrectionReview("submission", "review", assistant);
  assert.equal(reviewCorrection.confirmedAt, null);
  await service.saveCorrectionReview("submission", "review", assistant, edited);
});
