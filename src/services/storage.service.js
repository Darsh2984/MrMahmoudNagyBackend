const { Storage } = require("@google-cloud/storage");
const crypto = require("crypto");
const path = require("path");

/**
 * Google Cloud Storage wrapper. Everything else in the codebase calls
 * `uploadBuffer` / `deleteFile` and never touches @google-cloud/storage directly —
 * if we ever swap providers again, this is the only file that changes.
 *
 * Auth: GCS client picks up credentials automatically via one of:
 *   - GOOGLE_APPLICATION_CREDENTIALS env var pointing to a key file path, OR
 *   - GCS_KEY_JSON_BASE64 env var (base64-encoded service account JSON — convenient
 *     for hosting providers like Render where you can't easily upload a file).
 *
 * Required env vars:
 *   GCS_BUCKET_NAME       - the bucket to upload into
 *   GCS_KEY_JSON_BASE64    - (recommended for Render/hosted) base64 of the service account JSON
 *   -- or --
 *   GOOGLE_APPLICATION_CREDENTIALS - path to a service account key file (local dev)
 */

function buildStorageClient() {
  if (process.env.GCS_KEY_JSON_BASE64) {
    const credentials = JSON.parse(
      Buffer.from(process.env.GCS_KEY_JSON_BASE64, "base64").toString("utf-8")
    );
    return new Storage({ credentials, projectId: credentials.project_id });
  }
  // Falls back to GOOGLE_APPLICATION_CREDENTIALS / ADC automatically if set.
  return new Storage();
}

const storage = buildStorageClient();
const bucketName = process.env.GCS_BUCKET_NAME;

function getBucket() {
  if (!bucketName) {
    throw { status: 500, msg: "GCS_BUCKET_NAME is not configured" };
  }
  return storage.bucket(bucketName);
}

/**
 * Uploads a buffer (e.g. from multer memory storage) to GCS under a folder prefix,
 * returns the public URL. Bucket must have uniform bucket-level access + public read
 * configured (or use signed URLs instead — see getSignedUrl below for private buckets).
 */
async function uploadBuffer(buffer, originalFilename, mimetype, folder = "misc") {
  const bucket = getBucket();
  const ext = path.extname(originalFilename);
  const objectName = `${folder}/${Date.now()}-${crypto.randomBytes(6).toString("hex")}${ext}`;
  const file = bucket.file(objectName);

  await file.save(buffer, {
    metadata: { contentType: mimetype },
    resumable: false,
  });

  return `https://storage.googleapis.com/${bucketName}/${objectName}`;
}

/** Deletes a file given the full public URL previously returned by uploadBuffer. */
async function deleteFile(publicUrl) {
  if (!publicUrl || !publicUrl.includes(bucketName)) return;
  const objectName = publicUrl.split(`${bucketName}/`)[1];
  if (!objectName) return;
  try {
    await getBucket().file(objectName).delete();
  } catch (err) {
    // Non-fatal — log and move on; a missing file shouldn't block the API response.
    console.error("GCS delete failed:", err.message);
  }
}

/** For private buckets: generates a time-limited signed URL instead of a public one. */
async function getSignedUrl(objectName, expiresInMinutes = 60) {
  const [url] = await getBucket()
    .file(objectName)
    .getSignedUrl({ action: "read", expires: Date.now() + expiresInMinutes * 60 * 1000 });
  return url;
}

module.exports = { uploadBuffer, deleteFile, getSignedUrl };
