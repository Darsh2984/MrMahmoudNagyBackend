const multer = require("multer");

const memoryStorage = multer.memoryStorage();

const MAX_FILES_PER_REQUEST = 10;
const MAX_FILE_SIZE =
  50 * 1024 * 1024;

const ALLOWED_MIME_TYPES = new Set([
  "application/pdf",

  "image/png",
  "image/jpeg",
  "image/jpg",

  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",

  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",

  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",

  "text/plain",
]);

const upload = multer({
  storage: memoryStorage,

  limits: {
    fileSize: MAX_FILE_SIZE,
    files: MAX_FILES_PER_REQUEST,
  },

  fileFilter: (
    req,
    file,
    callback,
  ) => {
    if (
      !ALLOWED_MIME_TYPES.has(
        file.mimetype,
      )
    ) {
      return callback({
        status: 400,
        msg:
          "Unsupported homework file type. Upload PDF, image, Word, Excel, PowerPoint, or text files.",
      });
    }

    return callback(null, true);
  },
}).fields([
  {
    // New multi-file frontend field.
    name: "files",
    maxCount: MAX_FILES_PER_REQUEST,
  },
  {
    // Legacy single-file frontend field.
    name: "file",
    maxCount: 1,
  },
]);

function normalizeUploadedFiles(req) {
  if (!req.files) {
    req.uploadedFiles = [];
    return;
  }

  const multiFiles =
    Array.isArray(req.files.files)
      ? req.files.files
      : [];

  const legacyFiles =
    Array.isArray(req.files.file)
      ? req.files.file
      : [];

  req.uploadedFiles = [
    ...multiFiles,
    ...legacyFiles,
  ];
}

function homeworkFilesUpload(
  req,
  res,
  next,
) {
  upload(req, res, (error) => {
    if (!error) {
      normalizeUploadedFiles(req);
      return next();
    }

    if (
      error instanceof
      multer.MulterError
    ) {
      let message =
        "Homework upload failed.";

      if (
        error.code ===
        "LIMIT_FILE_SIZE"
      ) {
        message =
          "Each homework file must be 50 MB or smaller.";
      }

      if (
        error.code ===
        "LIMIT_FILE_COUNT"
      ) {
        message =
          `You can upload a maximum of ${MAX_FILES_PER_REQUEST} files at once.`;
      }

      if (
        error.code ===
        "LIMIT_UNEXPECTED_FILE"
      ) {
        message =
          'Upload homework using the multipart field name "files".';
      }

      return res
        .status(400)
        .json({
          msg: message,
        });
    }

    return res
      .status(error.status || 400)
      .json({
        msg:
          error.msg ||
          error.message ||
          "Homework upload failed.",
      });
  });
}

module.exports = {
  homeworkFilesUpload,
};