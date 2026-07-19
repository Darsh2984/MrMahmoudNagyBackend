require("dotenv").config();

const { Storage } = require("@google-cloud/storage");

function buildStorageClient() {
  const credentials = JSON.parse(
    Buffer.from(
      process.env.GCS_KEY_JSON_BASE64,
      "base64"
    ).toString("utf-8")
  );

  return new Storage({
    credentials,
    projectId: credentials.project_id,
  });
}

const storage = buildStorageClient();
const bucket = storage.bucket(
  process.env.GCS_BUCKET_NAME
);

async function run() {
  const objectName =
    `system-tests/${Date.now()}-delete-test.txt`;

  const file = bucket.file(objectName);

  try {
    await file.save(
      Buffer.from("Delete test"),
      {
        resumable: false,
        metadata: {
          contentType: "text/plain",
        },
      }
    );

    const [existsAfterUpload] =
      await file.exists();

    console.log(
      "Exists after upload:",
      existsAfterUpload
    );

    await file.delete();

    const [existsAfterDelete] =
      await file.exists();

    console.log(
      "Exists after delete:",
      existsAfterDelete
    );

    if (existsAfterDelete) {
      throw new Error(
        "Object still exists after deletion"
      );
    }

    console.log("Delete test succeeded");
  } catch (error) {
    console.error(
      "Delete test failed:",
      error.message || error
    );

    process.exitCode = 1;
  }
}

run();