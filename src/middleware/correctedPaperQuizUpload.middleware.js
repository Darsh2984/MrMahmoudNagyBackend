const multer = require("multer");

const memoryStorage =
  multer.memoryStorage();

const MAX_FILES = 10;

const MAX_FILE_SIZE =
  20 * 1024 * 1024;

const ALLOWED_MIME_TYPES =
  new Set([
    "application/pdf",
    "image/png",
    "image/jpeg",
    "image/jpg",
  ]);

const multerUpload = multer({
  storage: memoryStorage,

  limits: {
    files: MAX_FILES,
    fileSize: MAX_FILE_SIZE,
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
          "Corrected Paper quiz files must be PDF, JPG, JPEG, or PNG files.",
      });
    }

    return callback(null, true);
  },
}).array(
  "correctedFiles",
  MAX_FILES,
);

function correctedPaperQuizUpload(
  req,
  res,
  next,
) {
  multerUpload(
    req,
    res,
    (error) => {
      if (!error) {
        return next();
      }

      if (
        error instanceof
        multer.MulterError
      ) {
        let message =
          "Corrected Paper quiz upload failed.";

        if (
          error.code ===
          "LIMIT_FILE_SIZE"
        ) {
          message =
            "Each corrected file must be 20 MB or smaller.";
        }

        if (
          error.code ===
          "LIMIT_FILE_COUNT"
        ) {
          message =
            `You can upload a maximum of ${MAX_FILES} corrected files at once.`;
        }

        if (
          error.code ===
          "LIMIT_UNEXPECTED_FILE"
        ) {
          message =
            'Upload corrected files using the multipart field name "correctedFiles".';
        }

        return res
          .status(400)
          .json({
            msg: message,
          });
      }

      return res
        .status(
          error.status || 400,
        )
        .json({
          msg:
            error.msg ||
            error.message ||
            "Corrected Paper quiz upload failed.",
        });
    },
  );
}

module.exports = {
  correctedPaperQuizUpload,
};