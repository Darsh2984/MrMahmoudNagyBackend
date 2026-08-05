const multer = require("multer");

const MAX_CORRECTED_FILES = 20;
const MAX_FILE_SIZE = 50 * 1024 * 1024;

const ALLOWED_MIME_TYPES = new Set([
  "application/pdf",

  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/webp",

  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",

  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",

  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",

  "text/plain",
]);

const upload = multer({
  storage: multer.memoryStorage(),

  limits: {
    files: MAX_CORRECTED_FILES,
    fileSize: MAX_FILE_SIZE,
  },

  fileFilter(req, file, callback) {
    if (!ALLOWED_MIME_TYPES.has(file.mimetype)) {
      const error = new Error(
        "Unsupported corrected-file type. Upload PDF, image, Word, Excel, PowerPoint, or text files.",
      );

      error.status = 400;
      error.msg = error.message;

      return callback(error);
    }

    return callback(null, true);
  },
}).fields([
  {
    name: "correctedFiles",
    maxCount: MAX_CORRECTED_FILES,
  },
  {
    // Temporary compatibility with the previous frontend.
    name: "correctedFile",
    maxCount: 1,
  },
]);

function correctedHomeworkUpload(req, res, next) {
  upload(req, res, (error) => {
    if (error) {
      let message =
        error.msg ||
        error.message ||
        "Corrected-file upload failed.";

      if (error instanceof multer.MulterError) {
        if (error.code === "LIMIT_FILE_SIZE") {
          message =
            "Each corrected file must be 50 MB or smaller.";
        } else if (
          error.code === "LIMIT_FILE_COUNT" ||
          error.code === "LIMIT_UNEXPECTED_FILE"
        ) {
          message =
            `You can upload a maximum of ${MAX_CORRECTED_FILES} corrected files.`;
        }
      }

      return res.status(error.status || 400).json({
        msg: message,
      });
    }

    const correctedFiles =
      Array.isArray(req.files?.correctedFiles)
        ? req.files.correctedFiles
        : [];

    const legacyCorrectedFile =
      Array.isArray(req.files?.correctedFile)
        ? req.files.correctedFile
        : [];

    req.correctedFiles = [
      ...correctedFiles,
      ...legacyCorrectedFile,
    ];

    return next();
  });
}

module.exports = {
  correctedHomeworkUpload,
};