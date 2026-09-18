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
  if (buffer.subarray(0, 1024).includes(Buffer.from("%PDF-"))) return "application/pdf";
  const error = new Error("Student answer must be a readable PDF, JPG/JPEG or PNG file. Other document formats are not yet supported for AI grading.");
  error.status = 400;
  throw error;
}
module.exports = { answerMimeType, detectAnswerMimeType };
