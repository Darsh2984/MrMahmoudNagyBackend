const crypto = require("crypto");
const path = require("path");

const {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
} = require("@aws-sdk/client-s3");

const {
  getSignedUrl,
} = require("@aws-sdk/s3-request-presigner");

const accountId = process.env.R2_ACCOUNT_ID;
const accessKeyId = process.env.R2_ACCESS_KEY_ID;
const secretAccessKey =
  process.env.R2_SECRET_ACCESS_KEY;
const bucketName = process.env.R2_BUCKET_NAME;

function validateConfiguration() {
  if (
    !accountId ||
    !accessKeyId ||
    !secretAccessKey ||
    !bucketName
  ) {
    throw {
      status: 500,
      msg: "Cloudflare R2 is not fully configured",
    };
  }
}

validateConfiguration();

const r2 = new S3Client({
  region: "auto",

  endpoint:
    `https://${accountId}` +
    ".r2.cloudflarestorage.com",

  credentials: {
    accessKeyId,
    secretAccessKey,
  },
});

async function uploadBuffer(
  buffer,
  originalFilename,
  mimetype,
  folder = "misc"
) {
  if (
    !Buffer.isBuffer(buffer) ||
    buffer.length === 0
  ) {
    throw {
      status: 400,
      msg: "The uploaded file is empty",
    };
  }

  const extension = path
    .extname(originalFilename || "")
    .toLowerCase();

  const objectName =
    `${folder}/${Date.now()}-` +
    `${crypto.randomBytes(6).toString("hex")}` +
    `${extension}`;

  await r2.send(
    new PutObjectCommand({
      Bucket: bucketName,
      Key: objectName,
      Body: buffer,

      ContentType:
        mimetype ||
        "application/octet-stream",

      CacheControl:
        "private, max-age=0, no-transform",

      Metadata: {
        originalname:
          encodeURIComponent(
            originalFilename || "uploaded-file"
          ),
      },
    })
  );

  return objectName;
}

async function deleteFile(objectName) {
  if (
    !objectName ||
    typeof objectName !== "string"
  ) {
    return;
  }

  try {
    await r2.send(
      new DeleteObjectCommand({
        Bucket: bucketName,
        Key: objectName,
      })
    );
  } catch (error) {
    console.error(
      "R2 delete failed:",
      error.message
    );
  }
}

async function getSignedFileUrl(
  objectName,
  expiresInMinutes = 5
) {
  if (
    !objectName ||
    typeof objectName !== "string"
  ) {
    return null;
  }

  const command =
    new HeadObjectCommand({
      Bucket: bucketName,
      Key: objectName,
    });

  try {
    await r2.send(command);
  } catch (error) {
    if (
      error?.$metadata?.httpStatusCode === 404
    ) {
      throw {
        status: 404,
        msg: "Stored file was not found",
      };
    }

    throw error;
  }

  return getSignedUrl(
    r2,
    new (require("@aws-sdk/client-s3")
      .GetObjectCommand)({
      Bucket: bucketName,
      Key: objectName,
    }),
    {
      expiresIn:
        expiresInMinutes * 60,
    }
  );
}

async function getFileMetadata(objectName) {
  if (
    !objectName ||
    typeof objectName !== "string"
  ) {
    return null;
  }

  const response = await r2.send(
    new HeadObjectCommand({
      Bucket: bucketName,
      Key: objectName,
    })
  );

  let originalName = null;

  if (response.Metadata?.originalname) {
    try {
      originalName =
        decodeURIComponent(
          response.Metadata.originalname
        );
    } catch {
      originalName =
        response.Metadata.originalname;
    }
  }

  return {
    contentType:
      response.ContentType ||
      "application/octet-stream",

    size:
      typeof response.ContentLength === "number"
        ? response.ContentLength
        : null,

    originalName,
  };
}

module.exports = {
  uploadBuffer,
  deleteFile,
  getSignedUrl: getSignedFileUrl,
  getFileMetadata,
};