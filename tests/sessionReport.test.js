const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const { PDFDocument } = require("pdf-lib");
const { buildSessionReport } = require("../src/services/sessionReport.service");

const student = (id, name) => ({ id, name, email: `${id}@example.test` });
const amy = student("a", "Amy");
const bob = student("b", "Bob");
const cara = student("c", "Cara");
const session = {
  title: "Physics", date: new Date("2026-10-09T12:00:00Z"), groupId: "g",
  group: { name: "Group A", year: { name: "Year 9" } },
  attendance: [
    { studentId: "a", student: amy, status: "PRESENT" },
    { studentId: "b", student: bob, status: "ABSENT" },
  ],
  liveQuestions: [{ prompt: "Force?", gradeOutOf: 5, answers: [
    { studentId: "a", student: amy, status: "GRADED", grade: 0 },
    { studentId: "c", student: cara, status: "PENDING", grade: null },
  ] }],
};

test("generates a PDF with attendance and question pages", async () => {
  const bytes = await buildSessionReport(session);
  assert.equal(bytes.subarray(0, 5).toString(), "%PDF-");
  const pdf = await PDFDocument.load(bytes);
  assert.equal(pdf.getPageCount(), 2);
  assert.equal(pdf.getTitle(), "Physics - Attendance and Grades");
});

test("empty sessions still export a valid PDF", async () => {
  const pdf = await PDFDocument.load(await buildSessionReport({ ...session, attendance: [], liveQuestions: [] }));
  assert.equal(pdf.getPageCount(), 1);
});

test("large rosters and long names paginate", async () => {
  const attendance = Array.from({length: 100}, (_, i) => ({
    studentId: String(i), student: student(String(i), "Student " + i + " long name ".repeat(5)), status: "PRESENT",
  }));
  const pdf = await PDFDocument.load(await buildSessionReport({ ...session, attendance, liveQuestions: [] }));
  assert.ok(pdf.getPageCount() > 3);
});

test("report enforces staff roles and assistant group assignment", async () => {
  const context = { module: { exports: {} }, require: (name) => {
    if (name === "../config/prisma") return {
      session: { findUnique: async () => session },
      assistantGroupAssignment: { findUnique: async ({ where }) =>
        where.assistantId_groupId.assistantId === "assigned" ? { id: "assignment" } : null },
    };
    if (name === "./storage.service") return {};
    if (name === "./sessionReport.service") return { buildSessionReport: async () => "workbook" };
    throw new Error(`Unexpected import ${name}`);
  } };
  vm.runInNewContext(fs.readFileSync(require.resolve("../src/services/session.service"), "utf8"), context);
  const exportReport = context.module.exports.exportSessionReport;
  await assert.rejects(exportReport("s", { role: "STUDENT" }), error => error.status === 403);
  await assert.rejects(exportReport("s", { role: "ASSISTANT", id: "other" }), error => error.status === 403);
  for (const user of [
    { role: "TEACHER" },
    { role: "ASSISTANT", isHeadAssistant: true },
    { role: "ASSISTANT", id: "assigned" },
  ]) assert.equal(await exportReport("s", user), "workbook");
});
