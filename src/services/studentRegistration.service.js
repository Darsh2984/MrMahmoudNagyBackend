const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const prisma = require("../config/prisma");
const transporter = require("../config/nodemailer");
const { generateAccessCode } = require("../utils/accessCode");
const { renderEmail } = require("../utils/emailTemplate");
const { alertAssistantsOfStudentRegistration } = require("./staffAlert.service");

const EXPIRY_MINUTES = 30;
const RESEND_COOLDOWN_MS = 60_000;
const MAX_CODE_ATTEMPTS = 5;

function serviceError(status, msg) {
  return { status, msg };
}

function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

function hashToken(value) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function makeSecret() {
  const token = crypto.randomBytes(32).toString("hex");
  const code = String(crypto.randomInt(0, 1_000_000)).padStart(6, "0");
  return { token, code };
}

function verificationUrl(token) {
  const base = String(process.env.FRONTEND_URL || "").trim().replace(/\/+$/, "");
  if (!/^https?:\/\//i.test(base)) {
    throw serviceError(500, "FRONTEND_URL must be configured for email verification.");
  }
  return `${base}/verify-email/${encodeURIComponent(token)}`;
}

async function sendVerification(email, name, secret) {
  const url = verificationUrl(secret.token);
  const from = String(process.env.EMAIL_FROM || process.env.EMAIL_USER || "").trim();
  if (!from || !process.env.EMAIL_APP_PASSWORD) {
    throw serviceError(500, "Email delivery is not configured.");
  }
  await transporter.sendMail({
    from: { name: "Mahmoud Nagy Platform", address: from },
    to: email,
    subject: "Verify your Mahmoud Nagy student email",
    text: `Hello ${name},\n\nFinish your student registration using this link:\n${url}\n\nOr enter this code on the registration page: ${secret.code}\n\nThe link and code expire in ${EXPIRY_MINUTES} minutes. If you did not request this, ignore this email.`,
    html: renderEmail({
      preview: "Your verification code and link are inside. Complete your registration in 30 minutes.",
      eyebrow: "Student registration",
      title: "Verify your email",
      name,
      message: "You are one step away from creating your student account. Confirm this email address using the button below, or enter the code on the registration page.",
      buttonLabel: "Verify email address",
      buttonUrl: url,
      code: secret.code,
      expiresInMinutes: EXPIRY_MINUTES,
      securityNote: "If you did not start this registration, you can safely ignore this email. No account will be created.",
    }),
  });
}

async function validateDetails(input) {
  const email = normalizeEmail(input.email);
  const name = String(input.name || "").trim();
  const password = String(input.password || "");
  const studentPhone = String(input.studentPhone || "").trim();
  const otherSchoolName = String(input.otherSchoolName || "").trim();
  const fatherName = String(input.fatherName || "").trim();
  const fatherPhone = String(input.fatherPhone || "").trim();
  const motherName = String(input.motherName || "").trim();
  const motherPhone = String(input.motherPhone || "").trim();

  if (!name) throw serviceError(400, "Enter your full name.");
  if (!/^\S+@\S+\.\S+$/.test(email)) throw serviceError(400, "Enter a valid email address.");
  if (password.length < 6 || password.length > 128) throw serviceError(400, "Password must contain 6 to 128 characters.");
  if (!studentPhone) throw serviceError(400, "Enter the student's phone number.");
  if (!input.schoolId && !otherSchoolName) throw serviceError(400, "Select your school or enter your school name.");
  if (!input.desiredYearId) throw serviceError(400, "Select your academic year.");
  const hasFather = Boolean(fatherName && fatherPhone);
  const hasMother = Boolean(motherName && motherPhone);
  if (!hasFather && !hasMother) throw serviceError(400, "At least one parent is required.");

  const [user, year, school] = await Promise.all([
    prisma.user.findUnique({ where: { email }, select: { id: true } }),
    prisma.year.findUnique({ where: { id: input.desiredYearId }, select: { id: true } }),
    input.schoolId ? prisma.school.findUnique({ where: { id: input.schoolId }, select: { id: true } }) : Promise.resolve(null),
  ]);
  if (user) throw serviceError(400, "User already exists");
  if (!year) throw serviceError(400, "Selected academic year does not exist.");
  if (input.schoolId && !school) throw serviceError(400, "Selected school does not exist.");

  return {
    name, email,
    passwordHash: await bcrypt.hash(password, 10),
    schoolId: school?.id || null,
    otherSchoolName: school ? null : otherSchoolName,
    desiredYearId: year.id,
    attendanceMode: input.attendanceMode || null,
    studentPhone,
    fatherName: hasFather ? fatherName : null,
    fatherPhone: hasFather ? fatherPhone : null,
    motherName: hasMother ? motherName : null,
    motherPhone: hasMother ? motherPhone : null,
  };
}

async function issueVerification(email, details, rejectOnCooldown = false) {
  const existing = await prisma.pendingStudentRegistration.findUnique({ where: { email } });
  const now = new Date();
  if (existing && now - existing.lastSentAt < RESEND_COOLDOWN_MS) {
    if (rejectOnCooldown) {
      throw serviceError(429, "A verification request is already pending for this email. Please wait one minute, then submit again to use your latest details.");
    }
    return { email, retryAfterSeconds: Math.ceil((RESEND_COOLDOWN_MS - (now - existing.lastSentAt)) / 1000) };
  }
  const secret = makeSecret();
  const record = {
    tokenHash: hashToken(secret.token),
    codeHash: await bcrypt.hash(secret.code, 10),
    details,
    expiresAt: new Date(now.getTime() + EXPIRY_MINUTES * 60_000),
    attempts: 0,
    lastSentAt: now,
  };
  await prisma.pendingStudentRegistration.upsert({
    where: { email },
    create: { email, ...record },
    update: record,
  });
  try {
    await sendVerification(email, details.name, secret);
  } catch (error) {
    await prisma.pendingStudentRegistration.updateMany({
      where: { email, tokenHash: record.tokenHash },
      data: { lastSentAt: new Date(0) },
    });
    if (error.status) throw error;
    console.error("Student verification email failed:", error);
    throw serviceError(503, "Verification email could not be sent. Please try again.");
  }
  return { email, retryAfterSeconds: 60 };
}

async function registerStudent(input) {
  const details = await validateDetails(input);
  return issueVerification(details.email, details, true);
}

async function resendVerification(input) {
  const email = normalizeEmail(input.email);
  if (!/^\S+@\S+\.\S+$/.test(email)) throw serviceError(400, "Enter a valid email address.");
  const pending = await prisma.pendingStudentRegistration.findUnique({ where: { email } });
  if (!pending) return { email, retryAfterSeconds: 60 };
  return issueVerification(email, pending.details);
}

async function verifyStudentEmail(input) {
  const token = String(input.token || "").trim();
  const email = normalizeEmail(input.email);
  const code = String(input.code || "").trim();
  if (!token && (!email || !/^\d{6}$/.test(code))) {
    throw serviceError(400, "Enter the six-digit code or use the email link.");
  }
  if (token && !/^[a-f0-9]{64}$/.test(token)) {
    throw serviceError(400, "Verification link is invalid.");
  }

  const pending = token
    ? await prisma.pendingStudentRegistration.findUnique({ where: { tokenHash: hashToken(token) } })
    : await prisma.pendingStudentRegistration.findUnique({ where: { email } });
  if (!pending || pending.expiresAt <= new Date()) {
    throw serviceError(400, "Verification has expired or is invalid. Request a new email.");
  }
  if (!token) {
    const claimed = await prisma.pendingStudentRegistration.updateMany({
      where: { id: pending.id, attempts: { lt: MAX_CODE_ATTEMPTS }, expiresAt: { gt: new Date() } },
      data: { attempts: { increment: 1 } },
    });
    if (!claimed.count) throw serviceError(429, "Too many attempts. Request a new verification email.");
    if (!(await bcrypt.compare(code, pending.codeHash))) {
      throw serviceError(400, "Incorrect verification code.");
    }
  }

  const user = await prisma.$transaction(async (tx) => {
    const current = await tx.pendingStudentRegistration.findUnique({ where: { id: pending.id } });
    if (!current || current.tokenHash !== pending.tokenHash || current.expiresAt <= new Date()) {
      throw serviceError(400, "Verification has expired or is invalid. Request a new email.");
    }
    const details = current.details;
    const existing = await tx.user.findUnique({ where: { email: current.email }, select: { id: true } });
    if (existing) throw serviceError(400, "User already exists");
    const year = await tx.year.findUnique({ where: { id: details.desiredYearId }, select: { id: true } });
    if (!year) throw serviceError(400, "Selected academic year no longer exists. Please register again.");
    let schoolId = details.schoolId;
    if (schoolId) {
      const school = await tx.school.findUnique({ where: { id: schoolId }, select: { id: true } });
      if (!school) throw serviceError(400, "Selected school no longer exists. Please register again.");
    }
    if (!schoolId) {
      const school = await tx.school.findFirst({
        where: { name: { equals: details.otherSchoolName, mode: "insensitive" } },
        select: { id: true },
      });
      schoolId = school?.id || (await tx.school.create({ data: { name: details.otherSchoolName }, select: { id: true } })).id;
    }
    let accessCode;
    do {
      accessCode = generateAccessCode();
    } while (await tx.user.findUnique({ where: { accessCode }, select: { id: true } }));
    const user = await tx.user.create({
      data: {
        name: details.name, email: current.email, password: details.passwordHash,
        role: "STUDENT", schoolId, desiredYearId: details.desiredYearId,
        attendanceMode: details.attendanceMode, phone: details.studentPhone,
        fatherName: details.fatherName, fatherPhone: details.fatherPhone,
        motherName: details.motherName, motherPhone: details.motherPhone,
        accessCode,
      },
      select: {
        id: true,
        name: true,
        email: true,
        accessCode: true,
        school: { select: { id: true, name: true } },
        desiredYear: { select: { id: true, name: true } },
      },
    });
    await tx.pendingStudentRegistration.delete({ where: { id: current.id } });
    return user;
  });

  alertAssistantsOfStudentRegistration(user).catch((error) => {
    console.error("New student staff alert failed:", error?.message || error);
  });

  return user;
}

module.exports = { registerStudent, resendVerification, verifyStudentEmail };
