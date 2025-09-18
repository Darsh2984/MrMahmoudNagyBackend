// middleware/upload.js
const multer = require("multer");
const path = require("path");
const fs = require("fs");

// Ensure directories exist
const dirs = [
  "uploads/questions",
  "uploads/materials",
  "uploads/videos",
  "uploads/corrected",
];
dirs.forEach((dir) => {
  const fullPath = path.join(__dirname, "../", dir);
  if (!fs.existsSync(fullPath)) {
    fs.mkdirSync(fullPath, { recursive: true });
  }
});

// ================= Questions Upload (images) =================
const questionStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, "uploads/questions"),
  filename: (req, file, cb) => cb(null, Date.now() + "-" + file.originalname),
});

const questionFilter = (req, file, cb) => {
  const allowed = /jpeg|jpg|png/;
  const ext = path.extname(file.originalname).toLowerCase();
  if (allowed.test(ext)) cb(null, true);
  else cb(new Error("❌ Only images are allowed"), false);
};

const questionUpload = multer({ storage: questionStorage, fileFilter: questionFilter });

// ================= Materials Upload (PDF) =================
const materialStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, "uploads/materials"),
  filename: (req, file, cb) => cb(null, Date.now() + path.extname(file.originalname)),
});

const materialFilter = (req, file, cb) => {
  if (file.mimetype === "application/pdf") cb(null, true);
  else cb(new Error("❌ Only PDF files allowed!"), false);
};

const materialUpload = multer({ storage: materialStorage, fileFilter: materialFilter });

// ================= Video Upload (MP4/WebM/Ogg) =================
const videoStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, "uploads/videos"),
  filename: (req, file, cb) => cb(null, Date.now() + path.extname(file.originalname)),
});

const videoFilter = (req, file, cb) => {
  const allowed = ["video/mp4", "video/webm", "video/ogg"];
  if (allowed.includes(file.mimetype)) cb(null, true);
  else cb(new Error("❌ Invalid video format"), false);
};

const videoUpload = multer({ storage: videoStorage, fileFilter: videoFilter });

// ================= Corrected Upload (PDF) =================
const correctedStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, "uploads/corrected"),
  filename: (req, file, cb) => cb(null, Date.now() + "-corrected" + path.extname(file.originalname)),
});

const correctedFilter = (req, file, cb) => {
  if (file.mimetype === "application/pdf") cb(null, true);
  else cb(new Error("❌ Only PDF files allowed for corrected files!"), false);
};

const correctedUpload = multer({ storage: correctedStorage, fileFilter: correctedFilter });

// ================= Export =================
module.exports = {
  questionUpload,
  materialUpload,
  videoUpload,
  correctedUpload,
};
