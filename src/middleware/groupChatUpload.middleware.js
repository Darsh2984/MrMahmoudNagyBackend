const multer = require("multer");

const MAX_FILE_SIZE =
  50 * 1024 * 1024;

const ALLOWED_MIME_TYPES =
  new Set([
    "application/pdf",

    "image/jpeg",
    "image/jpg",
    "image/png",
    "image/webp",
    "image/gif",
    "image/heic",
    "image/heif",

    "video/mp4",
    "video/webm",
    "video/quicktime",
    "video/x-m4v",
    "video/3gpp",

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

    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",

    "application/vnd.ms-excel",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",

    "application/vnd.ms-powerpoint",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",

    "text/plain",
    "text/csv",
    "application/zip",
  ]);

const storage =
  multer.memoryStorage();

function fileFilter(
  req,
  file,
  callback,
) {
  if (
    !ALLOWED_MIME_TYPES.has(
      file.mimetype,
    )
  ) {
    return callback({
      status: 400,

      msg:
        "Unsupported attachment type.",
    });
  }

  callback(null, true);
}

const uploadGroupChatAttachment =
  multer({
    storage,

    fileFilter,

    limits: {
      files: 1,
      fileSize: MAX_FILE_SIZE,
    },
  }).single("attachment");

module.exports = {
  uploadGroupChatAttachment,
};