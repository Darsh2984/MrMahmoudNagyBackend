const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const prisma = require("../config/prisma");
const transporter = require("../config/nodemailer");
const { generateAccessCode } = require("../utils/accessCode");
const performanceService = require("./performance.service");

const SALT_ROUNDS = 10;

async function registerStudent({ name, email, password, schoolId, attendanceMode, studentPhone }) {
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
  const user = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
  if (!user) throw { status: 404, msg: "User not found" };

  const token = crypto.randomBytes(32).toString("hex");
  const resetPasswordExpires = new Date(Date.now() + 15 * 60 * 1000); // 15 mins

  await prisma.user.update({
    where: { id: user.id },
    data: { resetPasswordToken: token, resetPasswordExpires },
  });

  const resetURL = `${process.env.FRONTEND_URL}reset-password/${token}`;
  await transporter.sendMail({
    to: user.email,
    from: process.env.EMAIL_USER,
    subject: "Password Reset",
    html: `<h3>Password Reset Request</h3><p>Click the link below to reset your password:</p><a href="${resetURL}">${resetURL}</a><p>This link will expire in 15 minutes.</p>`,
  });

  return { msg: "Password reset link sent to your email" };
}

async function resetPassword(token, newPassword) {
  const user = await prisma.user.findFirst({
    where: { resetPasswordToken: token, resetPasswordExpires: { gt: new Date() } },
  });
  if (!user) throw { status: 400, msg: "Invalid or expired token" };

  const hashed = await bcrypt.hash(newPassword, SALT_ROUNDS);
  await prisma.user.update({
    where: { id: user.id },
    data: { password: hashed, resetPasswordToken: null, resetPasswordExpires: null },
  });

  return { msg: "Password reset successful. Please log in." };
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
    },
  });
  if (!user) throw { status: 404, msg: "User not found" };
  return user;
}

module.exports = {
  registerStudent,
  createAssistant,
  promoteToHead,
  demoteFromHead,
  login,
  lookupByAccessCode,
  forgotPassword,
  resetPassword,
  getCurrentUser,
};
