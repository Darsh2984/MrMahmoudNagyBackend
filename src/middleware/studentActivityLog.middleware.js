const prisma = require("../config/prisma");

const SENSITIVE_BODY_FIELDS = new Set([
  "password",
  "currentPassword",
  "newPassword",
  "token",
  "accessToken",
  "refreshToken",
]);

function describeAction(method, path) {
  if (method === "POST" && /^\/api\/submissions\/task\//.test(path)) {
    return "Uploaded homework files";
  }

  if (method === "DELETE" && /^\/api\/submissions\/.+\/files\//.test(path)) {
    return "Deleted a homework file";
  }

  if (/^\/api\/quiz-student\//.test(path)) {
    return method === "GET" ? "Viewed a quiz" : "Submitted quiz activity";
  }

  if (/^\/api\/live-questions\//.test(path)) {
    return method === "GET" ? "Viewed a live question" : "Answered a live question";
  }

  if (/^\/api\/group-chat\//.test(path)) {
    return method === "GET" ? "Viewed group chat" : "Updated group chat";
  }

  if (/^\/api\/student-support-chat\//.test(path)) {
    return method === "GET" ? "Viewed support chat" : "Updated support chat";
  }

  if (/^\/api\/tickets(?:\/|$)/.test(path)) {
    return method === "GET" ? "Viewed support tickets" : "Updated a support ticket";
  }

  const verb = {
    GET: "Viewed",
    POST: "Created or submitted",
    PATCH: "Updated",
    PUT: "Updated",
    DELETE: "Deleted",
  }[method] || method;

  return `${verb} ${path.replace(/^\/api\/?/, "") || "the system"}`;
}

function getUploadedFiles(req) {
  const possibleFiles = [
    ...(Array.isArray(req.uploadedFiles) ? req.uploadedFiles : []),
    ...(req.file ? [req.file] : []),
    ...Object.values(req.files || {}).flatMap((value) =>
      Array.isArray(value) ? value : value ? [value] : [],
    ),
  ];

  const uniqueFiles = Array.from(
    new Map(
      possibleFiles.map((file) => [
        `${file.originalname}:${file.size}:${file.fieldname}`,
        file,
      ]),
    ).values(),
  );

  return uniqueFiles.map((file) => ({
    name: file.originalname || file.filename || "Unnamed file",
    contentType: file.mimetype || null,
    size: Number.isFinite(Number(file.size)) ? Number(file.size) : null,
    field: file.fieldname || null,
  }));
}

function buildMetadata(req) {
  const files = getUploadedFiles(req);
  const bodyFields = Object.keys(req.body || {}).filter(
    (field) => !SENSITIVE_BODY_FIELDS.has(field),
  );
  const requestSize = Number(req.headers["content-length"]);
  const requestContentType = req.headers["content-type"] || null;

  if (
    !files.length &&
    !bodyFields.length &&
    !Number.isFinite(requestSize) &&
    !requestContentType
  ) {
    return undefined;
  }

  return {
    ...(files.length ? { fileCount: files.length, files } : {}),
    ...(bodyFields.length ? { bodyFields } : {}),
    ...(Number.isFinite(requestSize) ? { requestSize } : {}),
    ...(requestContentType ? { requestContentType } : {}),
  };
}

function getIpAddress(req) {
  const forwarded = req.headers["x-forwarded-for"];

  if (typeof forwarded === "string" && forwarded.trim()) {
    return forwarded.split(",")[0].trim();
  }

  return req.ip || req.socket?.remoteAddress || null;
}

module.exports = function studentActivityLog(req, res, next) {
  if (req.user?.role !== "STUDENT" || req.method === "OPTIONS") {
    return next();
  }

  const startedAt = Date.now();
  const path = req.originalUrl?.split("?")[0] || req.path || "/";
  let responseMessage = null;
  let logged = false;

  const originalJson = res.json.bind(res);

  res.json = (body) => {
    if (body && typeof body === "object") {
      responseMessage = body.msg || body.message || null;
    }

    return originalJson(body);
  };

  function writeLog(connectionClosed = false) {
    if (logged) return;
    logged = true;

    const statusCode = connectionClosed ? 499 : res.statusCode;
    const successful = statusCode >= 200 && statusCode < 400;

    prisma.studentActivityLog
      .create({
        data: {
          userId: req.user.id,
          userName: req.user.name || "Unknown student",
          userEmail: req.user.email || "Unknown email",
          method: req.method,
          path,
          action: describeAction(req.method, path),
          statusCode,
          successful,
          errorMessage: successful
            ? null
            : responseMessage ||
              (connectionClosed
                ? "Connection closed before the server completed the response."
                : "Request failed."),
          ipAddress: getIpAddress(req),
          userAgent: req.headers["user-agent"] || null,
          durationMs: Math.max(0, Date.now() - startedAt),
          metadata: buildMetadata(req),
        },
      })
      .catch((error) => {
        console.error("Student activity log write failed:", error.message);
      });
  }

  res.once("finish", () => writeLog(false));
  res.once("close", () => {
    if (!res.writableFinished) {
      writeLog(true);
    }
  });

  return next();
};
