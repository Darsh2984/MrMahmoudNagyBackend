// middleware/videoUpload.js
const multer = require("multer");
const path = require("path");

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, "uploads/videos/");
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + path.extname(file.originalname));
  }
});

const fileFilter = (req, file, cb) => {
  const allowed = ["video/mp4", "video/webm", "video/ogg"];
  if (allowed.includes(file.mimetype)) cb(null, true);
  else cb(new Error("Invalid video format"), false);
};

module.exports = multer({ storage, fileFilter });
