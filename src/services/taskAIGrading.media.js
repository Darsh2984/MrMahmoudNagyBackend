const {
  EncryptedPDFError,
  PDFDocument,
} = require("pdf-lib");

function mediaError(message) {
  const error = new Error(message);
  error.status = 400;
  return error;
}

function hasPdfHeader(buffer) {
  return buffer
    .subarray(0, Math.min(buffer.length, 1024))
    .includes(Buffer.from("%PDF-"));
}

function hasPdfEndMarker(buffer) {
  return buffer
    .subarray(Math.max(0, buffer.length - 64 * 1024))
    .includes(Buffer.from("%%EOF"));
}

function hasEncryptionDictionary(buffer) {
  return buffer
    .subarray(Math.max(0, buffer.length - 64 * 1024))
    .includes(Buffer.from("/Encrypt"));
}

async function validatePdfForAI(buffer, label = "PDF") {
  if (!Buffer.isBuffer(buffer) || !buffer.length) {
    throw mediaError(`${label} is empty.`);
  }

  if (buffer.length > 50 * 1024 * 1024) {
    throw mediaError(`${label} must be no larger than 50 MB.`);
  }

  if (!hasPdfHeader(buffer)) {
    throw mediaError(
      `${label} does not contain a valid PDF header. It may have been renamed to .pdf without being converted.`,
    );
  }

  if (hasEncryptionDictionary(buffer)) {
    throw mediaError(
      `${label} is encrypted or password-protected. Export an unlocked copy and try again.`,
    );
  }

  try {
    const pdf = await PDFDocument.load(buffer, {
      updateMetadata: false,
      throwOnInvalidObject: false,
    });
    const pageCount = pdf.getPageCount();

    if (pageCount === 0) {
      throw mediaError(`${label} has no pages.`);
    }

    if (pageCount > 500) {
      throw mediaError(`${label} exceeds the 500-page limit.`);
    }

    return {
      pageCount,
      compatibilityWarning: null,
    };
  } catch (error) {
    if (error?.status) throw error;

    if (
      error instanceof EncryptedPDFError ||
      /encrypted|password/i.test(String(error?.message || ""))
    ) {
      throw mediaError(
        `${label} is encrypted or password-protected. Export an unlocked copy and try again.`,
      );
    }

    if (!hasPdfEndMarker(buffer)) {
      throw mediaError(
        `${label} appears incomplete or corrupted. Open it on the device, then Print or Save as PDF and upload the new copy.`,
      );
    }

    // Some scanner and Drive-generated PDFs contain recoverable structures
    // that pdf-lib rejects even though PDF viewers and Gemini can read them.
    return {
      pageCount: null,
      compatibilityWarning: String(error?.message || "PDF parser incompatibility"),
    };
  }
}

function answerMimeType(file) {
  const type = String(file.contentType || "").toLowerCase().split(";")[0].trim();
  if (type === "image/jpg") return "image/jpeg";
  if (["application/pdf", "image/jpeg", "image/png"].includes(type)) return type;
  if (/\.pdf$/i.test(file.name || "")) return "application/pdf";
  if (/\.jpe?g$/i.test(file.name || "")) return "image/jpeg";
  if (/\.png$/i.test(file.name || "")) return "image/png";
  return null;
}
function detectAnswerMimeType(buffer) {
  if (buffer.length >= 24 && buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return "image/png";
  if (buffer.length >= 4 && buffer[0] === 255 && buffer[1] === 216 && buffer[2] === 255) return "image/jpeg";
  if (hasPdfHeader(buffer)) return "application/pdf";
  const error = new Error("Student answer must be a readable PDF, JPG/JPEG or PNG file. Other document formats are not yet supported for AI grading.");
  error.status = 400;
  throw error;
}
module.exports = {
  answerMimeType,
  detectAnswerMimeType,
  validatePdfForAI,
};
