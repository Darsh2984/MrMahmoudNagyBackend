const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const { PDFDocument, StandardFonts } = require("pdf-lib");
const { annotatedPdf } = require("../src/services/liveQuestionAIPdf.service");

function service(mocks, file = "../src/services/liveQuestion.service") {
  const context = { module: { exports: {} }, Date, console, setImmediate, Buffer,
    require: name => { if (name in mocks) return mocks[name]; throw new Error("Unexpected import " + name); } };
  vm.runInNewContext(fs.readFileSync(require.resolve(file), "utf8"), context);
  return context.module.exports;
}
function submissionService({ closesAt, existing = null, type = "WRITTEN" } = {}) {
  const prisma = {
    liveQuestion: { findUnique: async () => ({ id: "q", type, correctAnswer: "B", gradeOutOf: 5, closesAt, session: { groupId: "g" } }) },
    groupMembership: { findUnique: async () => ({ id: "m" }) },
    liveQuestionAnswer: {
      findUnique: async () => existing,
      create: async ({ data }) => ({ id: "a", ...data }),
    },
  };
  return service({ "../config/prisma": prisma, "./storage.service": { uploadBuffer: async () => "key", getSignedUrl: async () => "signed" },
    "./notification.service": { notify: async () => {} } });
}
const file = { buffer: Buffer.from("image"), originalname: "a.jpg", mimetype: "image/jpeg" };
test("upload started before deadline survives slow transfer", async () => {
  const api = submissionService({ closesAt: new Date(Date.now() - 1000) });
  const result = await api.submitAnswer({ liveQuestionId: "q", studentId: "s", file, requestStartedAt: new Date(Date.now() - 2000) });
  assert.equal(result.id, "a");
});
test("late new upload rejected; previously received answer survives retry", async () => {
  const api = submissionService({ closesAt: new Date(Date.now() - 10000) });
  await assert.rejects(api.submitAnswer({ liveQuestionId: "q", studentId: "s", file }), e => e.status === 400);
  const retry = submissionService({ closesAt: new Date(0), existing: { id: "saved", answerImageUrl: "key" } });
  assert.equal((await retry.submitAnswer({ liveQuestionId: "q", studentId: "s", file })).id, "saved");
});
test("MCQ grading is immediate for correct and incorrect answers", async () => {
  const api = submissionService({ type: "MCQ" });
  for (const [selectedOption, grade] of [["B", 5], ["A", 0]]) {
    const result = await api.submitAnswer({ liveQuestionId: "q", studentId: "s", selectedOption });
    assert.equal(result.grade, grade); assert.equal(result.status, "GRADED");
  }
});
test("annotated export includes original pages and detailed feedback", async () => {
  const source = await PDFDocument.create();
  const page = source.addPage();
  page.drawText("Student work F = ma", { font: await source.embedFont(StandardFonts.Helvetica), x: 40, y: 700 });
  const result = { summary: "Good attempt", totalAwarded: 1, totalPossible: 2, percentage: 50,
    overallFeedback: "Check units.", strengths: ["Method"], weaknesses: ["Units"], questionBreakdown: [{
      question: "1", awarded: 1, possible: 2, studentAnswer: "F=ma", pageReferences: ["page 1"],
      awardedFor: ["Correct equation"], deductedFor: ["No units"], feedback: "Add units.",
    }] };
  const exportResult = await annotatedPdf(Buffer.from(await source.save()), result, "Student", "Mechanics",
    { confirmedAt: new Date(), confirmedByName: "Teacher" });
  const output = await PDFDocument.load(exportResult.body);
  if (process.env.LIVE_AI_PDF_PREVIEW) fs.writeFileSync(process.env.LIVE_AI_PDF_PREVIEW, exportResult.body);
  assert.ok(output.getPageCount() >= 2);
  assert.equal(output.getPage(0).getWidth(), 841.89);
  assert.match(exportResult.fileName, /Corrected\.pdf$/);
});
test("AI access rejects students, unrelated assistants, and MCQs", async () => {
  let type = "WRITTEN";
  const api = service({
    "../config/prisma": {
      liveQuestion: { findUnique: async () => ({ type, session: { groupId: "g" } }) },
      assistantGroupAssignment: { findUnique: async () => null },
    },
    "./storage.service": {}, "./taskAIGrading.service": {},
    "./taskAIGrading.validation": {}, "./taskAIGrading.media": {},
  }, "../src/services/liveQuestionAI.service");
  await assert.rejects(api.getState("q", { role: "STUDENT" }), e => e.status === 403);
  await assert.rejects(api.getState("q", { role: "ASSISTANT", id: "a" }), e => e.status === 403);
  type = "MCQ";
  await assert.rejects(api.getState("q", { role: "TEACHER" }), e => e.status === 400);
});
