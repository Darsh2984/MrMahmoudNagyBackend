const crypto = require("crypto");
const path = require("path");

const {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
  GetObjectCommand,
  CreateMultipartUploadCommand,
  UploadPartCommand,
  CompleteMultipartUploadCommand,
  AbortMultipartUploadCommand,
} = require("@aws-sdk/client-s3");

const {
  getSignedUrl: createPresignedUrl,
} = require("@aws-sdk/s3-request-presigner");

function createStorageError(status, msg) {
  const error = new Error(msg);

  error.status = status;
  error.msg = msg;

  return error;
}

function getRequiredEnvironmentVariable(name) {
  const value = process.env[name];

  if (!value) {
    throw createStorageError(
      500,
      `${name} is not configured`
    );
  }

  return value;
}

const accountId = getRequiredEnvironmentVariable(
  "R2_ACCOUNT_ID"
);

const accessKeyId = getRequiredEnvironmentVariable(
  "R2_ACCESS_KEY_ID"
);

const secretAccessKey =
  getRequiredEnvironmentVariable(
    "R2_SECRET_ACCESS_KEY"
  );

const bucketName = getRequiredEnvironmentVariable(
  "R2_BUCKET_NAME"
);

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

function normalizeFolder(folder) {
  if (
    typeof folder !== "string" ||
    !folder.trim()
  ) {
    return "misc";
  }

  return folder
    .trim()
    .replace(/^\/+|\/+$/g, "")
    .replace(/[^a-zA-Z0-9/_-]/g, "-");
}

function normalizeExtension(originalFilename) {
  return path
    .extname(originalFilename || "")
    .toLowerCase()
    .replace(/[^a-z0-9.]/g, "");
}

function createObjectKey(
  originalFilename,
  folder = "misc"
) {
  const safeFolder =
    normalizeFolder(folder);

  const extension =
    normalizeExtension(
      originalFilename
    );

  return (
    `${safeFolder}/${Date.now()}-` +
    `${crypto.randomBytes(8).toString("hex")}` +
    `${extension}`
  );
}

function normalizeObjectKey(value) {
  if (
    typeof value !== "string" ||
    !value.trim()
  ) {
    throw createStorageError(
      400,
      "An R2 object key is required"
    );
  }

  let objectKey = value.trim();

  objectKey = objectKey.replace(/^\/+/, "");
  objectKey = objectKey.replace(/\\/g, "/");
  objectKey = objectKey.replace(/\/{2,}/g, "/");

  if (
    !objectKey ||
    objectKey.endsWith("/")
  ) {
    throw createStorageError(
      400,
      "A file object key is required, not a folder"
    );
  }

  const segments = objectKey.split("/");

  if (
    segments.some(
      (segment) =>
        !segment ||
        segment === "." ||
        segment === ".."
    )
  ) {
    throw createStorageError(
      400,
      "The R2 object key is invalid"
    );
  }

  return objectKey;
}

function normalizeUploadId(uploadId) {
  if (
    typeof uploadId !== "string" ||
    !uploadId.trim()
  ) {
    throw createStorageError(
      400,
      "Multipart uploadId is required"
    );
  }

  return uploadId.trim();
}

function normalizePartNumber(partNumber) {
  const numericPartNumber =
    Number(partNumber);

  if (
    !Number.isInteger(numericPartNumber) ||
    numericPartNumber < 1 ||
    numericPartNumber > 10000
  ) {
    throw createStorageError(
      400,
      "Multipart partNumber must be an integer from 1 to 10000"
    );
  }

  return numericPartNumber;
}

function normalizeMultipartParts(parts) {
  if (!Array.isArray(parts) || !parts.length) {
    throw createStorageError(
      400,
      "Multipart upload parts are required"
    );
  }

  const normalizedParts = parts.map((part) => {
    const partNumber =
      normalizePartNumber(
        part.partNumber ||
          part.PartNumber
      );

    const eTag =
      part.eTag ||
      part.ETag;

    if (
      typeof eTag !== "string" ||
      !eTag.trim()
    ) {
      throw createStorageError(
        400,
        `ETag is required for part ${partNumber}`
      );
    }

    return {
      PartNumber: partNumber,
      ETag: eTag.trim(),
    };
  });

  normalizedParts.sort(
    (a, b) => a.PartNumber - b.PartNumber
  );

  const seen = new Set();

  for (const part of normalizedParts) {
    if (seen.has(part.PartNumber)) {
      throw createStorageError(
        400,
        `Duplicate multipart part number ${part.PartNumber}`
      );
    }

    seen.add(part.PartNumber);
  }

  return normalizedParts;
}

function getHttpStatusCode(error) {
  return error?.$metadata?.httpStatusCode;
}

function handleStoredFileError(error) {
  const statusCode =
    getHttpStatusCode(error);

  if (statusCode === 404) {
    throw createStorageError(
      404,
      "Stored file was not found"
    );
  }

  throw error;
}

async function streamToBuffer(body) {
  if (!body) {
    throw createStorageError(
      500,
      "The stored file returned no content"
    );
  }

  if (
    typeof body.transformToByteArray ===
    "function"
  ) {
    const bytes =
      await body.transformToByteArray();

    return Buffer.from(bytes);
  }

  const chunks = [];

  for await (const chunk of body) {
    chunks.push(
      Buffer.isBuffer(chunk)
        ? chunk
        : Buffer.from(chunk)
    );
  }

  return Buffer.concat(chunks);
}

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
    throw createStorageError(
      400,
      "The uploaded file is empty"
    );
  }

  const objectName =
    createObjectKey(
      originalFilename,
      folder
    );

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
            originalFilename ||
              "uploaded-file"
          ),
      },
    })
  );

  return objectName;
}

async function createPresignedUploadUrl({
  objectName,
  originalFilename,
  contentType,
  expiresInMinutes = 60,
}) {
  const normalizedObjectName =
    normalizeObjectKey(objectName);

  const normalizedContentType =
    typeof contentType === "string" &&
    contentType.trim()
      ? contentType.trim()
      : "application/octet-stream";

  const expiresInSeconds =
    Math.max(
      60,
      Math.min(
        Number(expiresInMinutes) || 60,
        60
      )
    ) * 60;

  const uploadUrl =
    await createPresignedUrl(
      r2,
      new PutObjectCommand({
        Bucket: bucketName,
        Key: normalizedObjectName,
        ContentType:
          normalizedContentType,
        CacheControl:
          "private, max-age=0, no-transform",
        Metadata: {
          originalname:
            encodeURIComponent(
              originalFilename ||
                "uploaded-file"
            ),
        },
      }),
      {
        expiresIn:
          expiresInSeconds,
      }
    );

  return {
    uploadUrl,
    objectName:
      normalizedObjectName,
    expiresInSeconds,
    contentType:
      normalizedContentType,
  };
}

async function createMultipartUpload({
  objectName,
  originalFilename,
  contentType,
}) {
  const normalizedObjectName =
    normalizeObjectKey(objectName);

  const normalizedContentType =
    typeof contentType === "string" &&
    contentType.trim()
      ? contentType.trim()
      : "application/octet-stream";

  const response =
    await r2.send(
      new CreateMultipartUploadCommand({
        Bucket: bucketName,
        Key: normalizedObjectName,
        ContentType:
          normalizedContentType,
        CacheControl:
          "private, max-age=0, no-transform",
        Metadata: {
          originalname:
            encodeURIComponent(
              originalFilename ||
                "uploaded-file"
            ),
        },
      })
    );

  if (!response.UploadId) {
    throw createStorageError(
      500,
      "R2 did not return a multipart uploadId"
    );
  }

  return {
    objectName:
      normalizedObjectName,
    uploadId:
      response.UploadId,
    contentType:
      normalizedContentType,
  };
}

async function createMultipartPartUploadUrl({
  objectName,
  uploadId,
  partNumber,
  expiresInMinutes = 60,
}) {
  const normalizedObjectName =
    normalizeObjectKey(objectName);

  const normalizedUploadId =
    normalizeUploadId(uploadId);

  const normalizedPartNumber =
    normalizePartNumber(partNumber);

  const expiresInSeconds =
    Math.max(
      5,
      Math.min(
        Number(expiresInMinutes) || 60,
        60
      )
    ) * 60;

  const uploadUrl =
    await createPresignedUrl(
      r2,
      new UploadPartCommand({
        Bucket: bucketName,
        Key: normalizedObjectName,
        UploadId:
          normalizedUploadId,
        PartNumber:
          normalizedPartNumber,
      }),
      {
        expiresIn:
          expiresInSeconds,
      }
    );

  return {
    uploadUrl,
    objectName:
      normalizedObjectName,
    uploadId:
      normalizedUploadId,
    partNumber:
      normalizedPartNumber,
    expiresInSeconds,
    method: "PUT",
  };
}

async function completeMultipartUpload({
  objectName,
  uploadId,
  parts,
}) {
  const normalizedObjectName =
    normalizeObjectKey(objectName);

  const normalizedUploadId =
    normalizeUploadId(uploadId);

  const normalizedParts =
    normalizeMultipartParts(parts);

  await r2.send(
    new CompleteMultipartUploadCommand({
      Bucket: bucketName,
      Key: normalizedObjectName,
      UploadId:
        normalizedUploadId,
      MultipartUpload: {
        Parts:
          normalizedParts,
      },
    })
  );

  return {
    objectName:
      normalizedObjectName,
    uploadId:
      normalizedUploadId,
    parts:
      normalizedParts.map((part) => ({
        partNumber:
          part.PartNumber,
        eTag:
          part.ETag,
      })),
  };
}

async function abortMultipartUpload({
  objectName,
  uploadId,
}) {
  if (!objectName || !uploadId) {
    return;
  }

  let normalizedObjectName;
  let normalizedUploadId;

  try {
    normalizedObjectName =
      normalizeObjectKey(objectName);

    normalizedUploadId =
      normalizeUploadId(uploadId);
  } catch {
    return;
  }

  try {
    await r2.send(
      new AbortMultipartUploadCommand({
        Bucket: bucketName,
        Key: normalizedObjectName,
        UploadId:
          normalizedUploadId,
      })
    );
  } catch (error) {
    console.error(
      "R2 multipart abort failed:",
      error.message
    );
  }
}

async function fileExists(objectName) {
  const normalizedObjectName =
    normalizeObjectKey(objectName);

  try {
    await r2.send(
      new HeadObjectCommand({
        Bucket: bucketName,
        Key: normalizedObjectName,
      })
    );

    return true;
  } catch (error) {
    const statusCode =
      getHttpStatusCode(error);

    if (statusCode === 404) {
      return false;
    }

    throw error;
  }
}

async function downloadBuffer(objectName) {
  const normalizedObjectName =
    normalizeObjectKey(objectName);

  let response;

  try {
    response = await r2.send(
      new GetObjectCommand({
        Bucket: bucketName,
        Key: normalizedObjectName,
      })
    );
  } catch (error) {
    handleStoredFileError(error);
  }

  const buffer =
    await streamToBuffer(
      response.Body
    );

  if (!buffer.length) {
    throw createStorageError(
      500,
      "The stored file is empty"
    );
  }

  let originalName = null;

  if (
    response.Metadata?.originalname
  ) {
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
    buffer,

    contentType:
      response.ContentType ||
      "application/octet-stream",

    size: buffer.length,

    originalName,
  };
}

async function deleteFile(objectName) {
  if (
    !objectName ||
    typeof objectName !== "string"
  ) {
    return;
  }

  let normalizedObjectName;

  try {
    normalizedObjectName =
      normalizeObjectKey(objectName);
  } catch {
    return;
  }

  try {
    await r2.send(
      new DeleteObjectCommand({
        Bucket: bucketName,
        Key: normalizedObjectName,
      })
    );
  } catch (error) {
    console.error(
      "R2 delete failed:",
      error.message
    );
  }
}

async function getSignedUrl(
  objectName,
  expiresInMinutes = 5
) {
  if (
    !objectName ||
    typeof objectName !== "string"
  ) {
    return null;
  }

  const normalizedObjectName =
    normalizeObjectKey(objectName);

  const expiresInSeconds =
    Math.max(
      1,
      Math.min(
        Number(expiresInMinutes) || 5,
        60
      )
    ) * 60;

  try {
    await r2.send(
      new HeadObjectCommand({
        Bucket: bucketName,
        Key: normalizedObjectName,
      })
    );
  } catch (error) {
    handleStoredFileError(error);
  }

  return createPresignedUrl(
    r2,
    new GetObjectCommand({
      Bucket: bucketName,
      Key: normalizedObjectName,
    }),
    {
      expiresIn:
        expiresInSeconds,
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

  const normalizedObjectName =
    normalizeObjectKey(objectName);

  let response;

  try {
    response = await r2.send(
      new HeadObjectCommand({
        Bucket: bucketName,
        Key: normalizedObjectName,
      })
    );
  } catch (error) {
    handleStoredFileError(error);
  }

  let originalName = null;

  if (
    response.Metadata?.originalname
  ) {
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
      typeof response.ContentLength ===
      "number"
        ? response.ContentLength
        : null,

    originalName,
  };
}

module.exports = {
  uploadBuffer,
  createObjectKey,
  createPresignedUploadUrl,
  createMultipartUpload,
  createMultipartPartUploadUrl,
  completeMultipartUpload,
  abortMultipartUpload,
  downloadBuffer,
  deleteFile,
  getSignedUrl,
  getFileMetadata,
  fileExists,
  normalizeObjectKey,
};