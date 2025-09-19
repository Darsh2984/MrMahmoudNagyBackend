// middleware/upload.js
const multer = require("multer");
const path = require("path");

// ================= Questions Upload (images) =================
const questionFilter = (req, file, cb) => {
  const allowed = /jpeg|jpg|png/;
  const ext = path.extname(file.originalname).toLowerCase();
  if (allowed.test(ext)) cb(null, true);
  else cb(new Error("❌ Only images are allowed"), false);
};
const questionUpload = multer({
  storage: multer.memoryStorage(),
  fileFilter: questionFilter,
});

// ================= Materials Upload (PDF) =================
const materialFilter = (req, file, cb) => {
  if (file.mimetype === "application/pdf") cb(null, true);
  else cb(new Error("❌ Only PDF files allowed!"), false);
};
const materialUpload = multer({
  storage: multer.memoryStorage(),
  fileFilter: materialFilter,
});

// ================= Video Upload (MP4/WebM/Ogg) =================
const videoFilter = (req, file, cb) => {
  const allowed = ["video/mp4", "video/webm", "video/ogg"];
  if (allowed.includes(file.mimetype)) cb(null, true);
  else cb(new Error("❌ Invalid video format"), false);
};
const videoUpload = multer({
  storage: multer.memoryStorage(),
  fileFilter: videoFilter,
});

// ================= Corrected Upload (PDF) =================
const correctedFilter = (req, file, cb) => {
  if (file.mimetype === "application/pdf") cb(null, true);
  else cb(new Error("❌ Only PDF files allowed for corrected files!"), false);
};
const correctedUpload = multer({
  storage: multer.memoryStorage(),
  fileFilter: correctedFilter,
});

// ================= Export =================
module.exports = {
  questionUpload,
  materialUpload,
  videoUpload,
  correctedUpload,
};
