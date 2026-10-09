const ExcelJS = require("exceljs");

async function buildSessionReport(session) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Mahmoud Nagy's Team";
  workbook.created = new Date();
  const date = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Africa/Cairo", dateStyle: "medium",
  }).format(session.date);
  const students = new Map();
  const attendance = new Map();
  for (const record of session.attendance) {
    students.set(record.studentId, record.student);
    attendance.set(record.studentId, record.status);
  }
  for (const question of session.liveQuestions) {
    for (const answer of question.answers) students.set(answer.studentId, answer.student);
  }
  const roster = [...students.values()].sort((a, b) =>
    (a.name || "").localeCompare(b.name || "") || a.id.localeCompare(b.id));

  function sheet(name, headings, widths, note) {
    const result = workbook.addWorksheet(name);
    result.columns = widths.map(width => ({ width }));
    const metadata = [
      `Mahmoud Nagy's Team - ${name}`, `Session: ${session.title}`,
      `Academic year: ${session.group.year.name}`,
      `Group: ${session.group.name} | ${date} (Egypt)`, note,
    ];
    metadata.forEach((value, index) => {
      result.mergeCells(index + 1, 1, index + 1, headings.length);
      result.getCell(index + 1, 1).value = value;
      result.getRow(index + 1).height = 30;
      result.getCell(index + 1, 1).alignment = { wrapText: true, vertical: "middle" };
    });
    result.getRow(6).values = headings;
    for (const rowNumber of [1, 6]) {
      result.getRow(rowNumber).height = 32;
      result.getRow(rowNumber).eachCell(cell => {
        cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF123E48" } };
      });
    }
    result.views = [{ state: "frozen", ySplit: 6 }];
    result.pageSetup = { paperSize: 9, orientation: "landscape", fitToPage: true,
      fitToWidth: 1, fitToHeight: 0, printTitlesRow: "1:6" };
    result.headerFooter.oddFooter = "Page &P of &N";
    return result;
  }
  const present = [...attendance.values()].filter(value => value === "PRESENT").length;
  const absent = [...attendance.values()].filter(value => value === "ABSENT").length;
  const attendanceSheet = sheet("Attendance",
    ["#", "Student", "Email", "Attendance"], [8, 34, 44, 24],
    `Present: ${present} | Absent: ${absent} | Not recorded: ${roster.length - attendance.size}. Saved session roster.`);
  roster.forEach((student, index) => attendanceSheet.addRow([
    index + 1, student.name || "", student.email || "",
    attendance.get(student.id) === "PRESENT" ? "Present" :
      attendance.get(student.id) === "ABSENT" ? "Absent" : "Not recorded",
  ]));
  const results = sheet("Live question results",
    ["Student", "Email", "Question", "Question text", "Answer status", "Grade", "Out of", "Selected option"],
    [32, 40, 14, 65, 24, 12, 12, 18],
    session.liveQuestions.length ? "Blank grades indicate no answer or pending grading. Zero is a recorded grade." : "No live questions in this session.");
  session.liveQuestions.forEach((question, index) => {
    const answers = new Map(question.answers.map(answer => [answer.studentId, answer]));
    for (const student of roster) {
      const answer = answers.get(student.id);
      const graded = answer?.status === "GRADED" && answer.grade != null;
      results.addRow([student.name || "", student.email || "", `Q${index + 1}`,
        question.prompt || "", !answer ? "No answer" : graded ? "Graded" : "Awaiting grading",
        graded ? answer.grade : null, question.gradeOutOf, answer?.selectedOption || ""]);
    }
  });
  for (const page of workbook.worksheets) {
    page.autoFilter = { from: { row: 6, column: 1 }, to: { row: Math.max(6, page.rowCount), column: page.columnCount } };
    for (let row = 7; row <= page.rowCount; row++) {
      page.getRow(row).alignment = { vertical: "top", wrapText: true };
      if (row % 2) page.getRow(row).eachCell(cell => {
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF0F5F3" } };
      });
    }
  }
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

module.exports = { buildSessionReport };
