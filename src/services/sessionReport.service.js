const fs = require("node:fs");
const { PDFDocument, rgb } = require("pdf-lib");
const fontkit = require("@pdf-lib/fontkit");

async function buildSessionReport(session) {
  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  pdf.setTitle(session.title + " - Attendance and Grades");
  pdf.setAuthor("Mahmoud Nagy's Team");
  const font = await pdf.embedFont(fs.readFileSync(require.resolve("@expo-google-fonts/cairo/400Regular/Cairo_400Regular.ttf")), { subset: true });
  const bold = await pdf.embedFont(fs.readFileSync(require.resolve("@expo-google-fonts/cairo/700Bold/Cairo_700Bold.ttf")), { subset: true });
  const navy = rgb(.07, .24, .28), pale = rgb(.94, .97, .96);
  const width = 595.28, height = 841.89, margin = 38, usable = width - margin * 2;
  let page, y;
  function nextPage(section) {
    page = pdf.addPage([width, height]);
    page.drawRectangle({ x: 0, y: height - 12, width, height: 12, color: navy });
    page.drawText("MAHMOUD NAGY'S TEAM", { x: margin, y: height - 44, font: bold, size: 13, color: navy });
    page.drawText(section, { x: margin, y: height - 66, font, size: 10, color: navy });
    y = height - 95;
  }
  function wrap(value, maxWidth, size = 10, face = font) {
    const output = [];
    let line = "";
    for (const word of String(value ?? "-").replace(/\s+/g, " ").split(" ")) {
      const candidate = line ? line + " " + word : word;
      if (face.widthOfTextAtSize(candidate, size) <= maxWidth) { line = candidate; continue; }
      if (line) output.push(line);
      line = "";
      for (const char of word) {
        if (line && face.widthOfTextAtSize(line + char, size) > maxWidth) { output.push(line); line = ""; }
        line += char;
      }
    }
    output.push(line);
    return output;
  }
  function text(value, section, face = font, size = 10) {
    for (const line of wrap(value, usable, size, face)) {
      if (y < 65) nextPage(section);
      page.drawText(line, { x: margin, y, font: face, size, color: navy });
      y -= size + 8;
    }
    y -= 5;
  }
  function table(headings, widths, rows, section) {
    function header() {
      page.drawRectangle({ x: margin, y: y - 23, width: usable, height: 27, color: navy });
      let x = margin;
      headings.forEach((label, i) => {
        page.drawText(label, { x: x + 7, y: y - 14, font: bold, size: 9, color: rgb(1, 1, 1) });
        x += widths[i];
      });
      y -= 27;
    }
    if (y < 110) nextPage(section);
    header();
    rows.forEach((row, index) => {
      const cells = row.map((value, i) => wrap(value, widths[i] - 14, 9));
      const count = Math.max(...cells.map(cell => cell.length));
      let offset = 0;
      while (offset < count) {
        if (y < 90) { nextPage(section); header(); }
        const chunk = Math.min(count - offset, Math.max(1, Math.floor((y - 72) / 16)));
        const rowHeight = chunk * 16 + 12;
        if (index % 2 === 0) page.drawRectangle({ x: margin, y: y - rowHeight, width: usable, height: rowHeight, color: pale });
        let x = margin;
        cells.forEach((cell, i) => {
          cell.slice(offset, offset + chunk).forEach((line, j) => {
            const rtl = /^[\u0600-\u06ff]/.test(line);
            page.drawText(line, { x: rtl ? x + widths[i] - 7 - font.widthOfTextAtSize(line, 9) : x + 7,
              y: y - 17 - j * 16, size: 9, font, color: navy });
          });
          x += widths[i];
        });
        y -= rowHeight;
        offset += chunk;
      }
    });
    y -= 16;
  }
  const students = new Map(), attendance = new Map();
  for (const record of session.attendance) { students.set(record.studentId, record.student); attendance.set(record.studentId, record.status); }
  for (const question of session.liveQuestions) for (const answer of question.answers) students.set(answer.studentId, answer.student);
  const roster = [...students.values()].sort((a, b) => (a.name || "").localeCompare(b.name || "") || a.id.localeCompare(b.id));
  nextPage("SESSION ATTENDANCE REPORT");
  text(session.title, "Attendance", bold, 17);
  text(session.group.year.name + " / " + session.group.name, "Attendance");
  text(new Intl.DateTimeFormat("en-GB", { timeZone: "Africa/Cairo", dateStyle: "medium" }).format(session.date) + " (Egypt)", "Attendance");
  const present = [...attendance.values()].filter(s => s === "PRESENT").length;
  const absent = [...attendance.values()].filter(s => s === "ABSENT").length;
  text("Present: " + present + " | Absent: " + absent + " | Not recorded: " + (roster.length - attendance.size), "Attendance", bold);
  text("Based on saved attendance records for this session.", "Attendance");
  if (!roster.length) text("No student records for this session.", "Attendance");
  else table(["Student", "Email", "Attendance"], [180, 230, usable - 410], roster.map(student => [student.name || "-", student.email || "-",
    attendance.get(student.id) === "PRESENT" ? "Present" : attendance.get(student.id) === "ABSENT" ? "Absent" : "Not recorded"]), "Attendance (continued)");
  if (!session.liveQuestions.length) text("No live questions in this session.", "Attendance");
  session.liveQuestions.forEach((question, index) => {
    const section = "LIVE QUESTION " + (index + 1) + " - RESULTS";
    nextPage(section);
    text(session.title, section, bold, 14);
    text(question.prompt || "Image question", section);
    text("Maximum grade: " + question.gradeOutOf, section, bold);
    const answers = new Map(question.answers.map(answer => [answer.studentId, answer]));
    if (!roster.length) text("No student answers recorded.", section);
    else table(["Student", "Answer status", "Grade", "Option"], [210, 150, 85, usable - 445], roster.map(student => {
      const answer = answers.get(student.id);
      const graded = answer?.status === "GRADED" && answer.grade != null;
      return [student.name || "-", !answer ? "No answer" : graded ? "Graded" : "Awaiting grading",
        graded ? answer.grade + " / " + question.gradeOutOf : "-", answer?.selectedOption || "-"];
    }), section);
  });
  pdf.getPages().forEach((item, index) => {
    item.drawText("Session report - teaching staff", { x: margin, y: 27, size: 8, font, color: navy });
    item.drawText((index + 1) + " / " + pdf.getPageCount(), { x: width - 80, y: 27, size: 8, font, color: navy });
  });
  return Buffer.from(await pdf.save());
}
module.exports = { buildSessionReport };
