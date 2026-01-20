const multer = require("multer");

const storage = multer.memoryStorage();

const allowedMimeTypes = [
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/webp",

  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",

  "audio/webm",
  "audio/ogg",
  "audio/mpeg",
  "audio/mp3",
  "audio/wav",
];

const fileFilter = (req, file, cb) => {
  const mime = file.mimetype.split(";")[0];

  // ✅ Allow voice files even if browser sends octet-stream
  if (
    allowedMimeTypes.includes(mime) ||
    (mime === "application/octet-stream" &&
      file.originalname.match(/\.(webm|ogg|mp3|wav)$/i))
  ) {
    cb(null, true);
  } else {
    console.error("❌ Blocked file type:", file.mimetype);
    cb(new Error("Unsupported file type"), false);
  }
};

const ticketUpload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 20 * 1024 * 1024, // 20 MB (safe for audio)
  },
});

module.exports = { ticketUpload };
