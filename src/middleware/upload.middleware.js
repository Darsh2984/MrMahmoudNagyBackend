const multer = require("multer");

// Memory storage — we never write to local disk. The buffer goes straight to
// storage.service.js -> Google Cloud Storage.
const memoryStorage = multer.memoryStorage();

const materialUpload = multer({
  storage: memoryStorage,
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB cap for PDFs/docs
  fileFilter: (req, file, cb) => {
    const allowed = ["application/pdf", "image/png", "image/jpeg", "image/jpg"];
    if (!allowed.includes(file.mimetype)) {
      return cb({ status: 400, msg: "Unsupported file type for material upload" });
    }
    cb(null, true);
  },
});

// Questions: always a questionFile (PDF), plus an optional markschemeFile (PDF, for
// WRITTEN-type questions only — MCQs just have a correctAnswer, no markscheme file).
const questionUpload = multer({
  storage: memoryStorage,

  limits: {
    fileSize: 20 * 1024 * 1024,
  },

  fileFilter: (req, file, cb) => {
    const allowedMimeTypes = [
      "application/pdf",
      "image/png",
      "image/jpeg",
      "image/jpg",
    ];

    if (!allowedMimeTypes.includes(file.mimetype)) {
      return cb({
        status: 400,
        msg:
          "Questions and markschemes must be PDF, JPG, JPEG, or PNG files",
      });
    }

    cb(null, true);
  },
}).fields([
  {
    name: "questionFile",
    maxCount: 1,
  },
  {
    name: "markschemeFile",
    maxCount: 1,
  },
]);

const videoUpload = multer({
  storage: memoryStorage,
  limits: { fileSize: 500 * 1024 * 1024 }, // 500MB cap for videos
  fileFilter: (req, file, cb) => {
    if (!file.mimetype.startsWith("video/")) {
      return cb({ status: 400, msg: "Unsupported file type for video upload" });
    }
    cb(null, true);
  },
});

module.exports = { materialUpload, videoUpload, questionUpload };
