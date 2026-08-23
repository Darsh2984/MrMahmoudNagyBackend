const crypto = require("crypto");
const path = require("path");

const {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
  GetObjectCommand,
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

  /*
   * Teachers may copy a key from Cloudflare with
   * a leading slash. R2 keys should not start with /.
   */
  objectKey = objectKey.replace(/^\/+/, "");

  /*
   * Convert Windows-style separators in case a path
   * was copied from somewhere using backslashes.
   */
  objectKey = objectKey.replace(/\\/g, "/");

  /*
   * Collapse accidental repeated slashes.
   *
   * Example:
   * materials//physics///video.mp4
   *
   * becomes:
   * materials/physics/video.mp4
   */
  objectKey = objectKey.replace(/\/{2,}/g, "/");

  /*
   * Reject directory-looking values.
   */
  if (
    !objectKey ||
    objectKey.endsWith("/")
  ) {
    throw createStorageError(
      400,
      "A file object key is required, not a folder"
    );
  }

  /*
   * Prevent obviously malformed traversal-like keys.
   *
   * R2 technically allows many key formats, but we
   * should not allow manual references such as:
   * ../secret/file.pdf
   */
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

  /*
   * Keep the original characters otherwise.
   *
   * This is important because manually uploaded R2
   * files may contain spaces, brackets, Unicode, etc.
   * We should not rename or mutate an existing R2 key.
   */
  return objectKey;
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

  const safeFolder =
    normalizeFolder(folder);

  const extension =
    normalizeExtension(
      originalFilename
    );

  const objectName =
    `${safeFolder}/${Date.now()}-` +
    `${crypto.randomBytes(8).toString("hex")}` +
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
            originalFilename ||
              "uploaded-file"
          ),
      },
    })
  );

  return objectName;
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
  downloadBuffer,
  deleteFile,
  getSignedUrl,
  getFileMetadata,
  fileExists,
  normalizeObjectKey,
};