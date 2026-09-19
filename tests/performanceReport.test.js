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

test("report queries filter by session date, task deadline, quiz date, and in-class date", async () => {
  const originals = {
    session: prisma.session.findMany,
    task: prisma.task.findMany,
    quiz: prisma.quiz.findMany,
    inClassQuiz: prisma.inClassQuiz.findMany,
  };
  const queries = {};
  try {
    for (const kind of Object.keys(originals)) {
      prisma[kind].findMany = async (query) => {
        queries[kind] = query;
        if (kind === "quiz") {
          return [{
            id: "quiz-1", title: "Paper", type: "PAPER",
            startAt: new Date("2026-09-10T10:00:00Z"), publishedAt: null,
            totalPoints: 10, questions: [{ points: 10 }],
            submissions: [{ studentId: "student-1", score: 0, isGraded: false }],
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
    assert.equal(reports[0].quizzes[0].attempted, true);
    assert.equal(reports[0].quizzes[0].score, null);
    assert.deepEqual(queries.session.where.date, { gte: period.from, lt: period.until });
    assert.deepEqual(queries.task.where.deadline, { gte: period.from, lt: period.until });
    assert.deepEqual(queries.inClassQuiz.where.date, { gte: period.from, lt: period.until });
    assert.deepEqual(queries.quiz.where.OR, [
      { startAt: { gte: period.from, lt: period.until } },
      { startAt: null, publishedAt: { gte: period.from, lt: period.until } },
    ]);
    assert.deepEqual(queries.quiz.where.status, { in: ["PUBLISHED", "CLOSED"] });
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
    tasks: [{ title: "Homework one", date, submitted: true, grade: 8, gradeOutOf: 10 }],
    quizzes: [{ title: "Chapter quiz", date, attempted: true, score: 4, total: 5 }],
    inClassQuizzes: [{ title: "Class practice", date, grade: 7, gradeOutOf: 10 }],
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
