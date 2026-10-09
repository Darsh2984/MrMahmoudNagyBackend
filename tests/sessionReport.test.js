const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const ExcelJS = require("exceljs");
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

test("workbook preserves roster, zero grades, pending and missing answers", async () => {
  const book = new ExcelJS.Workbook();
  await book.xlsx.load(await buildSessionReport(session));
  const attendance = book.getWorksheet("Attendance");
  assert.equal(attendance.getCell("D7").value, "Present");
  assert.equal(attendance.getCell("D8").value, "Absent");
  assert.equal(attendance.getCell("D9").value, "Not recorded");
  const results = book.getWorksheet("Live question results");
  assert.equal(results.getCell("F7").value, 0);
  assert.equal(results.getCell("E8").value, "No answer");
  assert.equal(results.getCell("E9").value, "Awaiting grading");
  assert.equal(results.getCell("F9").value, null);
});

test("empty sessions produce valid sheets", async () => {
  const book = new ExcelJS.Workbook();
  await book.xlsx.load(await buildSessionReport({ ...session, attendance: [], liveQuestions: [] }));
  assert.equal(book.worksheets.length, 2);
  assert.equal(book.getWorksheet("Attendance").rowCount, 6);
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
