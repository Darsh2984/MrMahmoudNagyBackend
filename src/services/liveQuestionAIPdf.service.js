const fs = require("node:fs");
const { PDFDocument, rgb } = require("pdf-lib");
const fontkit = require("@pdf-lib/fontkit");
const { detectAnswerMimeType } = require("./taskAIGrading.media");
const { createCorrectionPdf } = require("./taskAIGradingPdf.service");

async function annotatedPdf(buffer, result, studentName, title, correction) {
  const output = await PDFDocument.create();
  output.registerFontkit(fontkit);
  const font = await output.embedFont(fs.readFileSync(require.resolve("@expo-google-fonts/cairo/400Regular/Cairo_400Regular.ttf")), { subset: true });
  const mime = detectAnswerMimeType(buffer);
  const pages = [];
  if (mime === "application/pdf") {
    const source = await PDFDocument.load(buffer);
    if (source.isEncrypted) throw Object.assign(new Error("Export an unlocked student PDF first."), { status: 400 });
    for (const original of source.getPages()) pages.push(await output.embedPage(original));
  } else if (mime === "image/png") pages.push(await output.embedPng(buffer));
  else if (mime === "image/jpeg") pages.push(await output.embedJpg(buffer));
  else throw Object.assign(new Error("Unsupported student answer file."), { status: 400 });
  pages.forEach((original, index) => {
    const page = output.addPage([841.89, 595.28]);
    const scale = Math.min(560 / original.width, 535 / original.height);
    const options = { x: 20, y: 30, width: original.width * scale, height: original.height * scale };
    if (mime === "application/pdf") page.drawPage(original, options); else page.drawImage(original, options);
    page.drawLine({ start: { x: 600, y: 25 }, end: { x: 600, y: 570 }, color: rgb(.75, .8, .8) });
    let y = 550;
    function line(text, size = 9) {
      page.drawText(text, { x: 615, y, font, size, color: rgb(.15, .3, .3) }); y -= 17;
    }
    line("Page " + (index + 1) + " - Correction", 11);
    const notes = result.questionBreakdown.filter(q => (q.pageReferences || []).some(ref =>
      [...String(ref).matchAll(/page\s+(\d+)/gi)].some(match => Number(match[1]) === index + 1)));
    let truncated = false;
    for (const note of notes) {
      const text = note.question + ": " + note.awarded + "/" + note.possible + " marks. " +
        note.feedback + " Earned: " + note.awardedFor.join("; ") + ". Deductions: " + note.deductedFor.join("; ");
      let current = "";
      for (const word of text.replace(/\s+/g, " ").split(" ")) {
        const candidate = current ? current + " " + word : word;
        if (current && font.widthOfTextAtSize(candidate, 9) > 202) {
          if (y < 85) { truncated = true; break; }
          line(current); current = "";
        }
        // Split only unusually long tokens such as URLs.
        for (const char of (current ? " " : "") + word) {
          if (font.widthOfTextAtSize(current + char, 9) > 202) {
            if (y < 85) { truncated = true; break; }
            line(current); current = "";
          }
          current += char;
        }
        if (truncated) break;
      }
      if (!truncated && current) line(current);
      y -= 10;
      if (truncated) break;
    }
    if (!notes.length) line("See the detailed correction below.");
    page.drawText("Full feedback follows these answer pages.", { x: 615, y: 42, font, size: 8, color: rgb(.15, .3, .3) });
  });
  const report = await createCorrectionPdf({
    correction: { ...correction, reviewedResult: result },
    submission: { student: { name: studentName }, task: { title } },
  });
  const reportPdf = await PDFDocument.load(report.body);
  for (const page of await output.copyPages(reportPdf, reportPdf.getPageIndices())) output.addPage(page);
  return { body: Buffer.from(await output.save()), fileName: report.fileName };
}
module.exports = { annotatedPdf };
