const fs = require("fs");
const fontkit = require("@pdf-lib/fontkit");
const { PDFDocument, rgb } = require("pdf-lib");
const { DateTime } = require("luxon");

const FONT_REGULAR = require.resolve("@expo-google-fonts/cairo/400Regular/Cairo_400Regular.ttf");
const FONT_BOLD = require.resolve("@expo-google-fonts/cairo/700Bold/Cairo_700Bold.ttf");
const WIDTH = 595.28;
const HEIGHT = 841.89;
const MARGIN = 42;
const CONTENT_WIDTH = WIDTH - MARGIN * 2;
const NAVY = rgb(0.055, 0.19, 0.24);
const TEAL = rgb(0.035, 0.47, 0.49);
const INK = rgb(0.13, 0.21, 0.27);
const MUTED = rgb(0.42, 0.49, 0.53);
const PALE = rgb(0.94, 0.97, 0.97);
const BORDER = rgb(0.86, 0.91, 0.92);
const WARNING = rgb(0.72, 0.42, 0.03);

function clean(value) {
  return String(value ?? "").replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "").trim();
}

function safeFileName(value) {
  return clean(value || "Student")
    .normalize("NFC")
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, "-")
    .replace(/\s+/g, " ")
    .slice(0, 80) || "Student";
}

function wrapText(value, font, size, maxWidth) {
  const paragraphs = clean(value).split(/\r?\n/);
  const lines = [];
  for (const paragraph of paragraphs) {
    const words = paragraph.split(/\s+/).filter(Boolean);
    if (!words.length) {
      lines.push("");
      continue;
    }
    let line = "";
    for (const word of words) {
      const candidate = line ? `${line} ${word}` : word;
      if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
        line = candidate;
        continue;
      }
      if (line) lines.push(line);
      if (font.widthOfTextAtSize(word, size) <= maxWidth) {
        line = word;
        continue;
      }
      let part = "";
      for (const character of word) {
        if (part && font.widthOfTextAtSize(part + character, size) > maxWidth) {
          lines.push(part);
          part = character;
        } else {
          part += character;
        }
      }
      line = part;
    }
    if (line) lines.push(line);
  }
  return lines.length ? lines : ["-"];
}

function drawDirectionalText(page, text, x, y, size, font, color, maxWidth) {
  const firstArabic = text.search(/[\u0600-\u06FF]/);
  const firstLatin = text.search(/[A-Za-z]/);
  const rtl = firstArabic >= 0 && (firstLatin < 0 || firstArabic < firstLatin);
  const mixed = firstArabic >= 0 && firstLatin >= 0;
  if (mixed) {
    const runs = text.match(/[\u0600-\u06FF]+(?:\s+[\u0600-\u06FF]+)*\s*|[^\u0600-\u06FF]+/g) || [text];
    let cursor = rtl ? x + maxWidth : x;
    for (const run of runs) {
      const runWidth = font.widthOfTextAtSize(run, size);
      page.drawText(run, { x: rtl ? cursor - runWidth : cursor, y, size, font, color });
      cursor += rtl ? -runWidth : runWidth;
    }
    return;
  }
  const drawX = rtl ? x + maxWidth - font.widthOfTextAtSize(text, size) : x;
  page.drawText(text, { x: drawX, y, size, font, color });
}

async function createCorrectionPdf({ correction, submission }) {
  const document = await PDFDocument.create();
  document.registerFontkit(fontkit);
  const [regular, bold] = await Promise.all([
    document.embedFont(fs.readFileSync(FONT_REGULAR), { subset: true }),
    document.embedFont(fs.readFileSync(FONT_BOLD), { subset: true }),
  ]);
  const result = correction.reviewedResult;
  let page;
  let y;

  function newPage() {
    page = document.addPage([WIDTH, HEIGHT]);
    page.drawRectangle({ x: 0, y: HEIGHT - 16, width: WIDTH, height: 16, color: NAVY });
    drawDirectionalText(page, "NAGY'S MIND", MARGIN, HEIGHT - 49, 12, bold, NAVY, CONTENT_WIDTH);
    drawDirectionalText(page, "CONFIRMED AI GRADING REVIEW", MARGIN, HEIGHT - 66, 8, regular, TEAL, CONTENT_WIDTH);
    page.drawLine({ start: { x: MARGIN, y: 46 }, end: { x: WIDTH - MARGIN, y: 46 }, thickness: 0.7, color: BORDER });
    drawDirectionalText(page, "Private staff document - not published to the student", MARGIN, 29, 7, regular, MUTED, CONTENT_WIDTH);
    drawDirectionalText(page, `Page ${document.getPageCount()}`, WIDTH - MARGIN - 48, 29, 7, bold, MUTED, 48);
    y = HEIGHT - 91;
  }

  function ensure(height) {
    if (!page || y - height < 62) newPage();
  }

  function paragraph(value, options = {}) {
    const font = options.bold ? bold : regular;
    const size = options.size || 9;
    const lineHeight = options.lineHeight || size * 1.55;
    const indent = options.indent || 0;
    const maxWidth = CONTENT_WIDTH - indent;
    const lines = wrapText(value || "-", font, size, maxWidth);
    for (const line of lines) {
      ensure(lineHeight + 2);
      drawDirectionalText(page, line || " ", MARGIN + indent, y, size, font, options.color || INK, maxWidth);
      y -= lineHeight;
    }
    y -= options.after ?? 5;
  }

  function heading(value) {
    ensure(30);
    y -= 3;
    paragraph(value, { bold: true, size: 12, lineHeight: 18, color: NAVY, after: 5 });
    page.drawLine({ start: { x: MARGIN, y: y + 3 }, end: { x: WIDTH - MARGIN, y: y + 3 }, thickness: 0.6, color: BORDER });
    y -= 7;
  }

  function list(title, values) {
    if (!Array.isArray(values) || !values.length) return;
    paragraph(title, { bold: true, size: 9, after: 2 });
    values.forEach(value => paragraph(`- ${value}`, { indent: 10, size: 8.5, lineHeight: 13, after: 1 }));
    y -= 3;
  }

  newPage();
  ensure(115);
  page.drawRectangle({ x: MARGIN, y: y - 103, width: CONTENT_WIDTH, height: 103, color: PALE, borderColor: BORDER, borderWidth: 0.7 });
  const boxY = y;
  y -= 25;
  paragraph(submission.student.name, { bold: true, size: 18, lineHeight: 23, color: NAVY, indent: 14, after: 1 });
  paragraph(submission.task.title, { bold: true, size: 10, lineHeight: 15, indent: 14, after: 1 });
  paragraph(`${result.totalAwarded} / ${result.totalPossible} marks (${result.percentage}%)`, { bold: true, size: 11, lineHeight: 16, color: TEAL, indent: 14, after: 1 });
  const confirmed = DateTime.fromJSDate(new Date(correction.confirmedAt), { zone: "Africa/Cairo" }).toFormat("dd LLL yyyy, hh:mm a");
  paragraph(`Confirmed by ${correction.confirmedByName} on ${confirmed} (Egypt time)`, { size: 8, lineHeight: 12, color: MUTED, indent: 14, after: 0 });
  y = boxY - 121;

  heading("Reviewed summary");
  paragraph(result.summary);
  heading("Question-by-question review");
  for (const question of result.questionBreakdown) {
    ensure(70);
    paragraph(`${question.question} - ${question.awarded} / ${question.possible} marks`, { bold: true, size: 11, color: NAVY, after: 2 });
    if (question.needsTeacherReview) paragraph("Marked for additional human review", { bold: true, size: 8.5, color: WARNING, after: 3 });
    paragraph("What the student wrote", { bold: true, size: 8.5, color: TEAL, after: 1 });
    paragraph(question.studentAnswer, { size: 8.5, lineHeight: 13 });
    list("Evidence references", question.pageReferences);
    list("Marks awarded for", question.awardedFor);
    list("Marks deducted or missing for", question.deductedFor);
    paragraph("Feedback", { bold: true, size: 8.5, color: TEAL, after: 1 });
    paragraph(question.feedback, { size: 8.5, lineHeight: 13, after: 10 });
  }

  heading("Overall performance feedback");
  paragraph(result.overallFeedback);
  list("Strengths", result.strengths);
  list("Areas to improve", result.weaknesses);
  heading("Private staff notes");
  paragraph(result.teacherNotes || "No private notes.");

  return {
    body: Buffer.from(await document.save()),
    fileName: `${safeFileName(submission.student.name)} - ${safeFileName(submission.task.title)} - AI Grading Review.pdf`,
  };
}

module.exports = { createCorrectionPdf };
