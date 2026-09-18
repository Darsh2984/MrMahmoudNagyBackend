const fs = require("fs");
const os = require("os");
const path = require("path");
const multer = require("multer");

const uploadDir = path.join(
  os.tmpdir(),
  "ai-correction-uploads"
);

fs.mkdirSync(uploadDir, {
  recursive: true,
});

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },

  filename: (req, file, cb) => {
    const safeName = String(
      file.originalname || "file.pdf"
    )
      .replace(/[^\w.\-]+/g, "_")
      .slice(-80);

    cb(
      null,
      `${Date.now()}-${Math.round(
        Math.random() * 1e9
      )}-${safeName}`
    );
  },
});

const aiCorrectionUpload = multer({
  storage,

  limits: {
    fileSize: 50 * 1024 * 1024,
  },

  fileFilter: (req, file, cb) => {
    if (file.mimetype !== "application/pdf") {
      return cb({
        status: 400,
        msg: "Only PDF files are allowed.",
      });
    }

    cb(null, true);
  },
}).fields([
  {
    name: "questionPaper",
    maxCount: 1,
  },
  {
    name: "markScheme",
    maxCount: 1,
  },
  {
    name: "studentAnswer",
    maxCount: 1,
  },
]);

module.exports = {
  aiCorrectionUpload,
  taskAIReferencesUpload: function taskAIReferencesUpload(req, res, next) {
    const upload = multer({
      storage,
      limits: { fileSize: 50 * 1024 * 1024, files: 2 },
      fileFilter: (request, file, cb) => {
        if (file.mimetype !== "application/pdf") {
          return cb({ status: 400, msg: "Question paper and mark scheme must be PDFs." });
        }
        cb(null, true);
      },
    }).fields([
      { name: "questionPaper", maxCount: 1 },
      { name: "markScheme", maxCount: 1 },
    ]);
    upload(req, res, async error => {
      if (!error) return next();
      await Promise.allSettled(Object.values(req.files || {}).flat().map(file =>
        fs.promises.unlink(file.path),
      ));
      return res.status(error.status || 400).json({
        msg: error.code === "LIMIT_FILE_SIZE"
          ? "Each reference PDF must be 50 MB or smaller."
          : error.msg || error.message || "Reference upload failed.",
      });
    });
  },
};
