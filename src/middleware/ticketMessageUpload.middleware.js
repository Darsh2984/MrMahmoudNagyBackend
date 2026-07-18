const multer = require("multer");

const MAX_FILE_SIZE = 50 * 1024 * 1024;

const ALLOWED_MIME_TYPES = new Set([
  // PDFs
  "application/pdf",

  // Images
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/heic",
  "image/heif",

  // Videos
  "video/mp4",
  "video/webm",
  "video/quicktime",
  "video/x-m4v",
  "video/3gpp",

  // Audio / voice messages
  "audio/mpeg",
  "audio/mp3",
  "audio/mp4",
  "audio/m4a",
  "audio/x-m4a",
  "audio/wav",
  "audio/x-wav",
  "audio/webm",
  "audio/ogg",
  "audio/aac",
  "audio/3gpp",
]);

const storage = multer.memoryStorage();

function fileFilter(req, file, callback) {
  if (!ALLOWED_MIME_TYPES.has(file.mimetype)) {
    return callback({
      status: 400,
      msg: "Unsupported attachment type. Upload a PDF, image, video, or audio file.",
    });
  }

  callback(null, true);
}

const uploadTicketMessageAttachment = multer({
  storage,
  fileFilter,
  limits: {
    files: 1,
    fileSize: MAX_FILE_SIZE,
  },
}).single("attachment");

module.exports = {
  uploadTicketMessageAttachment,
};