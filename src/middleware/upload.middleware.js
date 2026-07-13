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

module.exports = { materialUpload, videoUpload };
