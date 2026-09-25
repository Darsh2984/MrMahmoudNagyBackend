const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const prisma = require("../src/config/prisma");
const service = require("../src/services/performanceReport.service");

test("Egypt date boundaries include the end day across daylight-saving changes", () => {
  const period = service.parsePeriod("2026-04-23", "2026-04-24");
  assert.equal(period.from.toISOString(), "2026-04-22T22:00:00.000Z");
  assert.equal(period.until.toISOString(), "2026-04-24T21:00:00.000Z");
  assert.throws(() => service.parsePeriod("2026-04-25", "2026-04-24"), /valid start and end/);
  assert.throws(() => service.parsePeriod("2026-02-30", "2026-03-01"), /valid start and end/);
});

test("report queries filter attendance by session date and both task types by deadline", async () => {
  const originals = {
    session: prisma.session.findMany,
    task: prisma.task.findMany,
  };
  const queries = {};
  try {
    for (const kind of Object.keys(originals)) {
      prisma[kind].findMany = async (query) => {
        queries[kind] = query;
        if (kind === "task") {
          return [{
            id: "task-1", title: "Class practice", taskType: "IN_CLASS_QUIZ",
            deadline: new Date("2026-09-10T10:00:00Z"), gradeOutOf: 10,
            submissions: [{ studentId: "student-1", grade: 7 }],
          }];
        }
        return [];
      };
    }
    const period = service.parsePeriod("2026-09-01", "2026-09-19");
    const reports = await service.loadGroupReports(
      { id: "group-1", name: "Foundation", year: { name: "2026" } },
      [{ id: "student-1", name: "Student" }],
      period,
    );
    assert.equal(reports.length, 1);
    assert.equal(reports[0].homework.length, 0);
    assert.equal(reports[0].inClassQuizzes[0].submitted, true);
    assert.equal(reports[0].inClassQuizzes[0].grade, 7);
    assert.deepEqual(queries.session.where.date, { gte: period.from, lt: period.until });
    assert.deepEqual(queries.task.where.deadline, { gte: period.from, lt: period.until });
  } finally {
    for (const [kind, original] of Object.entries(originals)) {
      prisma[kind].findMany = original;
    }
  }
});

test("one student produces a PDF and multiple students produce separate PDFs in a ZIP", async () => {
  const date = new Date("2026-09-10T10:00:00Z");
  const makeReport = (id, name) => ({
    student: { id, name },
    group: { name: "Foundation", yearName: "2026" },
    period: service.parsePeriod("2026-09-01", "2026-09-19"),
    attendance: Array.from({ length: 24 }, (_, index) => ({
      title: `Session ${index + 1} - Algebra and revision`, date,
      status: index % 3 === 0 ? "ABSENT" : "PRESENT",
    })),
    homework: [{ title: "Homework one", date, submitted: true, grade: 8, gradeOutOf: 10 }],
    inClassQuizzes: [{ title: "Class practice", date, submitted: true, grade: 7, gradeOutOf: 10 }],
  });
  const first = makeReport("student-1", "أحمد عبدالله Ahmed");
  const second = makeReport("student-2", "Mariam");
  const single = await service.createReportsDownload([first]);
  assert.equal(single.contentType, "application/pdf");
  assert.equal(single.body.subarray(0, 5).toString(), "%PDF-");
  assert.match(single.fileName, /Report - 2026-09-01 to 2026-09-19\.pdf$/);

  const combined = await service.createReportsDownload([first, second]);
  assert.equal(combined.contentType, "application/zip");
  const JSZip = require("jszip");
  const zip = await JSZip.loadAsync(combined.body);
  const names = Object.keys(zip.files);
  assert.equal(names.length, 2);
  assert(names.every((name) => name.endsWith(".pdf")));

  if (process.env.REPORT_QA_OUTPUT) {
    fs.writeFileSync(process.env.REPORT_QA_OUTPUT, single.body);
  }
});
