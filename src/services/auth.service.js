const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const prisma = require("../config/prisma");
const transporter = require("../config/nodemailer");
const { generateAccessCode } = require("../utils/accessCode");
const performanceService = require("./performance.service");

const SALT_ROUNDS = 10;

const PASSWORD_RESET_EXPIRY_MINUTES = 15;

function createServiceError(status, msg) {
  const error = new Error(msg);

  error.status = status;
  error.msg = msg;

  return error;
}

function normalizeEmail(value) {
  return String(value || "")
    .trim()
    .toLowerCase();
}

function createResetToken() {
  const rawToken = crypto
    .randomBytes(32)
    .toString("hex");

  const tokenHash = crypto
    .createHash("sha256")
    .update(rawToken)
    .digest("hex");

  return {
    rawToken,
    tokenHash,
  };
}

function hashResetToken(token) {
  return crypto
    .createHash("sha256")
    .update(String(token || ""))
    .digest("hex");
}

function buildResetPasswordUrl(rawToken) {
  const frontendUrl = String(
    process.env.FRONTEND_URL || "",
  )
    .trim()
    .replace(/\/+$/, "");

  if (!frontendUrl) {
    throw createServiceError(
      500,
      "FRONTEND_URL is not configured.",
    );
  }

  return `${frontendUrl}/reset-password/${encodeURIComponent(
    rawToken,
  )}`;
}

function validateNewPassword(password) {
  const value = String(password || "");

  if (value.length < 8) {
    throw createServiceError(
      400,
      "Password must contain at least 8 characters.",
    );
  }

  if (value.length > 128) {
    throw createServiceError(
      400,
      "Password is too long.",
    );
  }

  return value;
}

async function registerStudent({ name, email, password, schoolId, attendanceMode, studentPhone, fatherName, fatherPhone, motherName, motherPhone }) {
  const existing = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
  if (existing) throw { status: 400, msg: "User already exists" };

  let accessCode;
  do {
    accessCode = generateAccessCode();
  } while (await prisma.user.findUnique({ where: { accessCode } }));

  const hashed = await bcrypt.hash(password, SALT_ROUNDS);

  const user = await prisma.user.create({
    data: {
      name,
      email: email.toLowerCase(),
      password: hashed,
      role: "STUDENT",
      schoolId: schoolId || null,
      attendanceMode: attendanceMode || null,
      phone: studentPhone || null,
      fatherName: fatherName || null,
      fatherPhone: fatherPhone || null,
      motherName: motherName || null,
      motherPhone: motherPhone || null,
      accessCode,
    },
  });

  return user;
}

/**
 * Teacher-only: create a new ASSISTANT account.
 * managedByHeadId is required once at least one Head of Assistants exists (per spec —
 * every non-head assistant must report to a head once one exists).
 * New assistants are never created as heads directly — see promoteToHead below.
 */
async function createAssistant({ name, email, password, managedByHeadId }) {
  const existing = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
  if (existing) throw { status: 400, msg: "Email already registered" };

  const headExists = await prisma.user.count({ where: { role: "ASSISTANT", isHeadAssistant: true } });
  if (headExists > 0 && !managedByHeadId) {
    throw { status: 400, msg: "A Head of Assistants exists — managedByHeadId is required" };
  }
  if (managedByHeadId) {
    const head = await prisma.user.findUnique({ where: { id: managedByHeadId } });
    if (!head || !head.isHeadAssistant) {
      throw { status: 400, msg: "managedByHeadId must reference an existing Head of Assistants" };
    }
  }

  const hashed = await bcrypt.hash(password, SALT_ROUNDS);

  const user = await prisma.user.create({
    data: {
      name: name.trim(),
      email: email.toLowerCase().trim(),
      password: hashed,
      role: "ASSISTANT",
      isHeadAssistant: false,
      managedByHeadId: managedByHeadId || null,
      permissions: {}, // no permissions granted yet — teacher/head grants them explicitly
    },
  });

  return user;
}

/** Teacher-only: promote an existing assistant to Head of Assistants. */
async function promoteToHead(assistantId) {
  const assistant = await prisma.user.findUnique({ where: { id: assistantId } });
  if (!assistant || assistant.role !== "ASSISTANT") {
    throw { status: 404, msg: "Assistant not found" };
  }
  return prisma.user.update({
    where: { id: assistantId },
    data: { isHeadAssistant: true, managedByHeadId: null }, // heads don't report to another head
  });
}

/** Teacher-only: demote a Head of Assistants back to a regular assistant. */
async function demoteFromHead(assistantId, newManagedByHeadId = null) {
  const assistant = await prisma.user.findUnique({ where: { id: assistantId } });
  if (!assistant || !assistant.isHeadAssistant) {
    throw { status: 404, msg: "Head of Assistants not found" };
  }
  return prisma.user.update({
    where: { id: assistantId },
    data: { isHeadAssistant: false, managedByHeadId: newManagedByHeadId },
  });
}

async function login({ email, password }) {
  const user = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
  if (!user) throw { status: 400, msg: "User not found" };
  if (!user.password) throw { status: 400, msg: "No password set for this account" };

  const isMatch = await bcrypt.compare(password, user.password);
  if (!isMatch) throw { status: 400, msg: "Invalid credentials" };

  const token = jwt.sign({ id: user.id, role: user.role }, process.env.JWT_SECRET, {
    expiresIn: "1d",
  });

  return {
    token,
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      isHeadAssistant: user.isHeadAssistant,
      managedByHeadId: user.managedByHeadId,
      accessCode: user.role === "STUDENT" ? user.accessCode : undefined,
    },
  };
}

/**
 * Parent flow: no account, just look up a student read-only by access code. This is
 * the full replacement for the old system's separate parent-account/parent-login
 * flow — includes a performance summary for whichever group the student is in.
 */
async function lookupByAccessCode(accessCode) {
  const student = await prisma.user.findUnique({
    where: { accessCode },
    select: {
      id: true,
      name: true,
      attendanceMode: true,
      groupMemberships: {
        select: { group: { select: { id: true, name: true, year: { select: { name: true } } } } },
      },
    },
  });
  if (!student) throw { status: 404, msg: "Invalid access code" };

  const groupId = student.groupMemberships[0]?.group.id;
  const performance = groupId ? await performanceService.getStudentPerformance(student.id, groupId) : null;

  return { ...student, performance };
}

/** Requests a password reset — emails a time-limited token link, ported from the old system. */
async function forgotPassword(email) {
  const normalizedEmail = normalizeEmail(email);

  if (
    !normalizedEmail ||
    !/^\S+@\S+\.\S+$/.test(normalizedEmail)
  ) {
    throw createServiceError(
      400,
      "Enter a valid email address.",
    );
  }

  /*
   * Always return the same public message.
   * This prevents people from checking which
   * email addresses have platform accounts.
   */
  const publicResult = {
    msg:
      "If an account exists for this email, a password reset link has been sent.",
  };

  const user = await prisma.user.findUnique({
    where: {
      email: normalizedEmail,
    },

    select: {
      id: true,
      name: true,
      email: true,
    },
  });

  if (!user) {
    return publicResult;
  }

  const {
    rawToken,
    tokenHash,
  } = createResetToken();

  const resetPasswordExpires =
    new Date(
      Date.now() +
        PASSWORD_RESET_EXPIRY_MINUTES *
          60 *
          1000,
    );

  const resetUrl =
    buildResetPasswordUrl(rawToken);

  await prisma.user.update({
    where: {
      id: user.id,
    },

    data: {
      /*
       * Store only the SHA-256 hash.
       * The raw token exists only in the email.
       */
      resetPasswordToken:
        tokenHash,

      resetPasswordExpires,
    },
  });

  try {
    await transporter.sendMail({
      from: {
        name: "Mahmoud Nagy Platform",
        address:
          process.env.EMAIL_FROM ||
          process.env.EMAIL_USER,
      },

      to: user.email,

      subject:
        "Reset your Mahmoud Nagy Platform password",

      text: [
        `Hello ${user.name || "there"},`,
        "",
        "We received a request to reset your password.",
        "",
        `Reset your password: ${resetUrl}`,
        "",
        `This link expires in ${PASSWORD_RESET_EXPIRY_MINUTES} minutes.`,
        "",
        "If you did not request this reset, you can ignore this email.",
      ].join("\n"),

      html: `
        <!doctype html>
        <html lang="en">
          <head>
            <meta charset="utf-8" />
            <meta
              name="viewport"
              content="width=device-width, initial-scale=1"
            />
          </head>

          <body
            style="
              margin: 0;
              padding: 24px;
              background: #f5f7fb;
              font-family: Arial, sans-serif;
              color: #1f2937;
            "
          >
            <div
              style="
                max-width: 560px;
                margin: 0 auto;
                padding: 32px;
                background: #ffffff;
                border: 1px solid #e5e7eb;
                border-radius: 16px;
              "
            >
              <h1
                style="
                  margin: 0 0 16px;
                  font-size: 24px;
                "
              >
                Reset your password
              </h1>

              <p
                style="
                  margin: 0 0 14px;
                  line-height: 1.6;
                "
              >
                Hello ${user.name || "there"},
              </p>

              <p
                style="
                  margin: 0 0 22px;
                  line-height: 1.6;
                "
              >
                We received a request to reset your
                Mahmoud Nagy Platform password.
              </p>

              <a
                href="${resetUrl}"
                style="
                  display: inline-block;
                  padding: 13px 22px;
                  border-radius: 10px;
                  background: #153e75;
                  color: #ffffff;
                  text-decoration: none;
                  font-weight: 700;
                "
              >
                Reset password
              </a>

              <p
                style="
                  margin: 22px 0 0;
                  line-height: 1.6;
                  color: #6b7280;
                "
              >
                This link expires in
                ${PASSWORD_RESET_EXPIRY_MINUTES} minutes
                and can only be used once.
              </p>

              <p
                style="
                  margin: 14px 0 0;
                  line-height: 1.6;
                  color: #6b7280;
                "
              >
                If you did not request this reset,
                you can safely ignore this email.
              </p>
            </div>
          </body>
        </html>
      `,
    });
  } catch (emailError) {
    /*
     * Invalidate the token when delivery fails.
     */
    await prisma.user.update({
      where: {
        id: user.id,
      },

      data: {
        resetPasswordToken: null,
        resetPasswordExpires: null,
      },
    });

    console.error(
      "[Password reset] Email delivery failed:",
      emailError?.message || emailError,
    );

    throw createServiceError(
      502,
      "The password reset email could not be sent. Please try again later.",
    );
  }

  return publicResult;
}

async function resetPassword(
  token,
  newPassword,
) {
  const rawToken = String(
    token || "",
  ).trim();

  if (!rawToken) {
    throw createServiceError(
      400,
      "Password reset token is required.",
    );
  }

  const password =
    validateNewPassword(newPassword);

  const tokenHash =
    hashResetToken(rawToken);

  const user =
    await prisma.user.findFirst({
      where: {
        resetPasswordToken:
          tokenHash,

        resetPasswordExpires: {
          gt: new Date(),
        },
      },

      select: {
        id: true,
      },
    });

  if (!user) {
    throw createServiceError(
      400,
      "This password reset link is invalid or has expired.",
    );
  }

  const hashedPassword =
    await bcrypt.hash(
      password,
      SALT_ROUNDS,
    );

  await prisma.user.update({
    where: {
      id: user.id,
    },

    data: {
      password:
        hashedPassword,

      /*
       * Clearing these fields makes
       * the reset link single-use.
       */
      resetPasswordToken:
        null,

      resetPasswordExpires:
        null,
    },
  });

  return {
    msg:
      "Password reset successful. You can now sign in with your new password.",
  };
}

async function getCurrentUser(userId) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      isHeadAssistant: true,
      managedByHeadId: true,
      accessCode: true,
      attendanceMode: true,
      permissions: true,
      // Only meaningful for STUDENT, but harmless/empty for other roles — this is
      // what lets the frontend gate a student with no group to a "waiting" screen.
      groupMemberships: { select: { id: true } },
    },
  });
  if (!user) throw { status: 404, msg: "User not found" };
  return user;
}

async function listAssistants() {
  return prisma.user.findMany({
    where: { role: "ASSISTANT" },
    select: { id: true, name: true, email: true, isHeadAssistant: true, managedByHeadId: true, permissions: true },
    orderBy: { name: "asc" },
  });
}

/** Teacher/Head can set permission flags for a regular assistant. Heads are always fully permitted (see rbac.middleware), so this is a no-op for them in practice — kept simple by allowing it anyway rather than special-casing. */
async function updateAssistantPermissions(assistantId, permissions) {
  const assistant = await prisma.user.findUnique({ where: { id: assistantId } });
  if (!assistant || assistant.role !== "ASSISTANT") throw { status: 404, msg: "Assistant not found" };
  return prisma.user.update({ where: { id: assistantId }, data: { permissions } });
}

async function deleteAssistant(assistantId) {
  const assistant = await prisma.user.findUnique({ where: { id: assistantId } });
  if (!assistant || assistant.role !== "ASSISTANT") throw { status: 404, msg: "Assistant not found" };
  return prisma.user.delete({ where: { id: assistantId } });
}

module.exports = {
  registerStudent,
  createAssistant,
  promoteToHead,
  demoteFromHead,
  listAssistants,
  updateAssistantPermissions,
  deleteAssistant,
  login,
  lookupByAccessCode,
  forgotPassword,
  resetPassword,
  getCurrentUser,
};
