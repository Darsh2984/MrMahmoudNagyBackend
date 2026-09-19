const fs = require("fs");
const { DateTime } = require("luxon");
const JSZip = require("jszip");
const fontkit = require("@pdf-lib/fontkit");
const { PDFDocument, rgb } = require("pdf-lib");
const prisma = require("../config/prisma");

const ZONE = "Africa/Cairo";
const FONT_REGULAR = require.resolve("@expo-google-fonts/cairo/400Regular/Cairo_400Regular.ttf");
const FONT_BOLD = require.resolve("@expo-google-fonts/cairo/700Bold/Cairo_700Bold.ttf");
const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;
const MARGIN = 40;
const NAVY = rgb(0.055, 0.19, 0.24);
const TEAL = rgb(0.035, 0.47, 0.49);
const INK = rgb(0.13, 0.21, 0.27);
const MUTED = rgb(0.42, 0.49, 0.53);
const PALE = rgb(0.94, 0.97, 0.97);
const BORDER = rgb(0.86, 0.91, 0.92);

function reportError(status, msg) {
  const error = new Error(msg);
  error.status = status;
  error.msg = msg;
  return error;
}

function parsePeriod(startDate, endDate) {
  const start = DateTime.fromISO(String(startDate || ""), { zone: ZONE });
  const end = DateTime.fromISO(String(endDate || ""), { zone: ZONE });

  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(startDate || "") ||
    !/^\d{4}-\d{2}-\d{2}$/.test(endDate || "") ||
    !start.isValid || !end.isValid ||
    start.toISODate() !== startDate || end.toISODate() !== endDate ||
    start > end
  ) {
    throw reportError(400, "Choose a valid start and end date (YYYY-MM-DD), with the start no later than the end.");
  }

  return {
    startDate,
    endDate,
    from: start.startOf("day").toJSDate(),
    until: end.plus({ days: 1 }).startOf("day").toJSDate(),
  };
}

function cairoDate(value) {
  if (!value) return "-";
  return DateTime.fromJSDate(new Date(value), { zone: ZONE }).toFormat("dd LLL yyyy");
}

function safeFileName(value) {
  return String(value || "Student")
    .normalize("NFC")
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 90) || "Student";
}

function reportFileName(student, period) {
  return `${safeFileName(student.name)} - Report - ${period.startDate} to ${period.endDate}.pdf`;
}

async function loadGroupReports(group, students, period) {
  const studentIds = students.map((student) => student.id);
  const dateRange = { gte: period.from, lt: period.until };

  const [sessions, tasks, quizzes, inClassQuizzes] = await Promise.all([
    prisma.session.findMany({
      where: { groupId: group.id, date: dateRange },
      orderBy: [{ date: "asc" }, { id: "asc" }],
      select: {
        id: true, title: true, date: true,
        attendance: {
          where: { studentId: { in: studentIds } },
          select: { studentId: true, status: true },
        },
      },
    }),
    prisma.task.findMany({
      where: { groups: { some: { groupId: group.id } }, deadline: dateRange },
      orderBy: [{ deadline: "asc" }, { id: "asc" }],
      select: {
        id: true, title: true, deadline: true, gradeOutOf: true,
        submissions: {
          where: { studentId: { in: studentIds } },
          select: { studentId: true, grade: true, submittedAt: true },
        },
      },
    }),
    prisma.quiz.findMany({
      where: {
        groups: { some: { groupId: group.id } },
        status: { in: ["PUBLISHED", "CLOSED"] },
        OR: [
          { startAt: dateRange },
          { startAt: null, publishedAt: dateRange },
        ],
      },
      orderBy: [{ startAt: "asc" }, { id: "asc" }],
      select: {
        id: true, title: true, type: true, startAt: true, publishedAt: true,
        totalPoints: true,
        questions: { select: { points: true } },
        submissions: {
          where: { studentId: { in: studentIds }, isSubmitted: true },
          select: { studentId: true, score: true, isGraded: true, submittedAt: true },
        },
      },
    }),
    prisma.inClassQuiz.findMany({
      where: { groupId: group.id, date: dateRange },
      orderBy: [{ date: "asc" }, { id: "asc" }],
      select: {
        id: true, quizName: true, date: true, gradeOutOf: true, studentGrades: true,
      },
    }),
  ]);

  return students.map((student) => ({
    student,
    group: { name: group.name, yearName: group.year.name },
    period,
    attendance: sessions.map((session) => {
      const record = session.attendance.find((item) => item.studentId === student.id);
      return {
        title: session.title,
        date: session.date,
        status: record?.status || "NOT_MARKED",
      };
    }),
    tasks: tasks.map((task) => {
      const submission = task.submissions.find((item) => item.studentId === student.id);
      return {
        title: task.title,
        date: task.deadline,
        submitted: Boolean(submission),
        grade: submission?.grade ?? null,
        gradeOutOf: task.gradeOutOf,
      };
    }),
    quizzes: quizzes.map((quiz) => {
      const submission = quiz.submissions.find((item) => item.studentId === student.id);
      const points = quiz.questions.reduce((total, question) => total + Number(question.points || 0), 0);
      return {
        title: quiz.title,
        date: quiz.startAt || quiz.publishedAt,
        attempted: Boolean(submission),
        score: submission
          ? quiz.type === "PAPER" && !submission.isGraded ? null : submission.score
          : null,
        total: Number(quiz.totalPoints) > 0 ? quiz.totalPoints : points,
      };
    }),
    inClassQuizzes: inClassQuizzes.map((quiz) => {
      const grades = Array.isArray(quiz.studentGrades) ? quiz.studentGrades : [];
      const record = grades.find((item) => item.studentId === student.id);
      return {
        title: quiz.quizName,
        date: quiz.date,
        grade: record?.grade ?? null,
        gradeOutOf: quiz.gradeOutOf,
      };
    }),
  }));
}

function fitText(text, font, size, width) {
  const source = String(text ?? "-").replace(/\s+/g, " ").trim() || "-";
  if (font.widthOfTextAtSize(source, size) <= width) return source;
  let result = source;
  while (result.length > 1 && font.widthOfTextAtSize(`${result}...`, size) > width) {
    result = result.slice(0, -1);
  }
  return `${result}...`;
}

function drawText(page, value, x, y, size, font, color, maxWidth) {
  const text = maxWidth ? fitText(value, font, size, maxWidth) : String(value);
  const firstArabic = text.search(/[\u0600-\u06FF]/);
  const firstLatin = text.search(/[A-Za-z]/);
  const rtl = firstArabic >= 0 && (firstLatin < 0 || firstArabic < firstLatin);
  const mixed = firstArabic >= 0 && firstLatin >= 0;

  if (mixed) {
    // Fontkit shapes Arabic correctly when each directional run is drawn alone.
    // Passing a mixed run reverses its Latin characters in pdf-lib.
    const runs = text.match(/[\u0600-\u06FF]+(?:\s+[\u0600-\u06FF]+)*\s*|[^\u0600-\u06FF]+/g) || [text];
    let cursor = rtl && maxWidth ? x + maxWidth : x;
    for (const run of runs) {
      const width = font.widthOfTextAtSize(run, size);
      const runX = rtl ? cursor - width : cursor;
      page.drawText(run, { x: runX, y, size, font, color });
      cursor += rtl ? -width : width;
    }
    return;
  }

  const drawX = rtl && maxWidth ? x + maxWidth - font.widthOfTextAtSize(text, size) : x;
  page.drawText(text, { x: drawX, y, size, font, color });
}

function drawPageBase(page, fonts, pageNo) {
  page.drawRectangle({ x: 0, y: PAGE_HEIGHT - 16, width: PAGE_WIDTH, height: 16, color: NAVY });
  drawText(page, "NAGY'S MIND", MARGIN, PAGE_HEIGHT - 54, 12, fonts.bold, NAVY);
  drawText(page, "STUDENT PERFORMANCE REPORT", MARGIN, PAGE_HEIGHT - 72, 8, fonts.regular, TEAL);
  page.drawLine({ start: { x: MARGIN, y: 46 }, end: { x: PAGE_WIDTH - MARGIN, y: 46 }, thickness: 0.7, color: BORDER });
  drawText(page, "Confidential - for staff and family review", MARGIN, 30, 7, fonts.regular, MUTED);
  drawText(page, `Page ${pageNo}`, PAGE_WIDTH - MARGIN - 42, 30, 7, fonts.bold, MUTED);
}

async function createStudentReportPdf(report) {
  const document = await PDFDocument.create();
  document.registerFontkit(fontkit);
  const [regular, bold] = await Promise.all([
    document.embedFont(fs.readFileSync(FONT_REGULAR), { subset: true }),
    document.embedFont(fs.readFileSync(FONT_BOLD), { subset: true }),
  ]);
  const fonts = { regular, bold };
  let page;
  let y;

  function nextPage() {
    page = document.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    drawPageBase(page, fonts, document.getPageCount());
    y = PAGE_HEIGHT - 100;
  }

  function ensure(height) {
    if (y - height < 64) nextPage();
  }

  nextPage();
  page.drawRectangle({ x: MARGIN, y: y - 92, width: PAGE_WIDTH - 2 * MARGIN, height: 92, color: PALE });
  drawText(page, report.student.name, MARGIN + 18, y - 32, 21, bold, NAVY, PAGE_WIDTH - 2 * MARGIN - 36);
  drawText(page, `${report.group.yearName}  /  ${report.group.name}`, MARGIN + 18, y - 56, 10, regular, INK, PAGE_WIDTH - 2 * MARGIN - 36);
  drawText(page, `${report.period.startDate} to ${report.period.endDate}  |  Egypt time`, MARGIN + 18, y - 75, 9, regular, MUTED);
  y -= 112;

  const marked = report.attendance.filter((item) => item.status !== "NOT_MARKED");
  const present = marked.filter((item) => item.status === "PRESENT").length;
  const submitted = report.tasks.filter((item) => item.submitted).length;
  const attempted = report.quizzes.filter((item) => item.attempted).length;
  const graded = report.inClassQuizzes.filter((item) => item.grade != null).length;
  const cards = [
    ["ATTENDANCE", `${present}/${marked.length}`, `${report.attendance.length - marked.length} not marked`],
    ["TASKS", `${submitted}/${report.tasks.length}`, "submitted"],
    ["QUIZZES", `${attempted}/${report.quizzes.length}`, "attempted"],
    ["IN-CLASS", `${graded}/${report.inClassQuizzes.length}`, "graded"],
  ];
  const gap = 10;
  const cardWidth = (PAGE_WIDTH - 2 * MARGIN - 3 * gap) / 4;
  cards.forEach(([label, value, helper], index) => {
    const x = MARGIN + index * (cardWidth + gap);
    page.drawRectangle({ x, y: y - 75, width: cardWidth, height: 75, color: rgb(1, 1, 1), borderColor: BORDER, borderWidth: 0.8 });
    drawText(page, label, x + 10, y - 19, 7.5, bold, TEAL, cardWidth - 20);
    drawText(page, value, x + 10, y - 45, 20, bold, NAVY, cardWidth - 20);
    drawText(page, helper, x + 10, y - 62, 7.5, regular, MUTED, cardWidth - 20);
  });
  y -= 98;

  function section(title, caption, rows) {
    ensure(rows.length ? 84 : 96);
    page.drawRectangle({ x: MARGIN, y: y - 4, width: 4, height: 23, color: TEAL });
    drawText(page, title, MARGIN + 13, y + 3, 14, bold, NAVY);
    drawText(page, caption, MARGIN + 13, y - 13, 8, regular, MUTED, PAGE_WIDTH - 2 * MARGIN - 13);
    y -= 38;

    if (!rows.length) {
      page.drawRectangle({ x: MARGIN, y: y - 36, width: PAGE_WIDTH - 2 * MARGIN, height: 36, color: PALE });
      drawText(page, "No records in this period", MARGIN + 12, y - 23, 9, regular, MUTED);
      y -= 50;
      return;
    }

    rows.forEach((row, index) => {
      ensure(39);
      const rowY = y - 34;
      if (index % 2 === 0) {
        page.drawRectangle({ x: MARGIN, y: rowY, width: PAGE_WIDTH - 2 * MARGIN, height: 38, color: PALE });
      }
      drawText(page, row.title, MARGIN + 10, rowY + 20, 9.5, regular, INK, 275);
      drawText(page, cairoDate(row.date), MARGIN + 290, rowY + 20, 8, regular, MUTED, 92);
      drawText(page, row.result, MARGIN + 390, rowY + 20, 9, bold, row.positive ? TEAL : MUTED, 115);
      y -= 38;
    });
    y -= 20;
  }

  section("Attendance", "Based on the session date", report.attendance.map((item) => ({
    ...item,
    result: item.status === "PRESENT" ? "Present" : item.status === "ABSENT" ? "Absent" : "Not marked",
    positive: item.status === "PRESENT",
  })));
  section("Tasks", "Based on each task deadline", report.tasks.map((item) => ({
    ...item,
    result: item.submitted
      ? item.grade != null ? `${item.grade}/${item.gradeOutOf}` : "Submitted"
      : "Not submitted",
    positive: item.submitted,
  })));
  section("Quizzes", "Based on quiz start or publication date", report.quizzes.map((item) => ({
    ...item,
    result: item.attempted
      ? item.score != null ? `${item.score}/${item.total}` : "Pending grade"
      : "Not attempted",
    positive: item.attempted,
  })));
  section("In-class quizzes", "Based on the in-class quiz date", report.inClassQuizzes.map((item) => ({
    ...item,
    result: item.grade != null ? `${item.grade}/${item.gradeOutOf}` : "Not graded",
    positive: item.grade != null,
  })));

  document.setTitle(`${report.student.name} - Report - ${report.period.startDate} to ${report.period.endDate}`);
  document.setAuthor("Nagy's Mind");
  document.setSubject("Student performance report");
  return Buffer.from(await document.save());
}

async function createReportsDownload(reports) {
  if (reports.length === 1) {
    return {
      body: await createStudentReportPdf(reports[0]),
      fileName: reportFileName(reports[0].student, reports[0].period),
      contentType: "application/pdf",
    };
  }

  const zip = new JSZip();
  const usedNames = new Set();
  for (const report of reports) {
    let fileName = reportFileName(report.student, report.period);
    if (usedNames.has(fileName)) {
      fileName = fileName.replace(/\.pdf$/i, ` - ${report.student.id.slice(0, 8)}.pdf`);
    }
    usedNames.add(fileName);
    zip.file(fileName, await createStudentReportPdf(report));
  }
  return {
    body: await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE", compressionOptions: { level: 3 } }),
    fileName: `${safeFileName(reports[0].group.name)} - Student Reports - ${reports[0].period.startDate} to ${reports[0].period.endDate}.zip`,
    contentType: "application/zip",
  };
}

module.exports = {
  parsePeriod,
  loadGroupReports,
  createStudentReportPdf,
  createReportsDownload,
  reportFileName,
};
