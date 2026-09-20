const test = require("node:test");
const assert = require("node:assert/strict");

let pending = null;
let student = null;
let sent = [];
const prisma = {
  user: {
    findUnique: async ({ where }) => student && (where.email === student.email || where.accessCode === student.accessCode) ? student : null,
    create: async ({ data }) => {
      student = { id: "student-1", ...data, desiredYear: { id: "year-1", name: "Foundation" } };
      return student;
    },
  },
  year: { findUnique: async ({ where }) => where.id === "year-1" ? { id: "year-1" } : null },
  school: {
    findUnique: async () => null,
    findFirst: async () => ({ id: "school-1" }),
    create: async () => ({ id: "school-1" }),
  },
  pendingStudentRegistration: {
    findUnique: async ({ where }) => pending && Object.entries(where).every(([key, value]) => pending[key] === value) ? pending : null,
    upsert: async ({ create, update }) => {
      pending = pending ? { ...pending, ...update } : { id: "pending-1", ...create };
      return pending;
    },
    updateMany: async ({ where, data }) => {
      if (!pending || (where.id && pending.id !== where.id) || (where.email && pending.email !== where.email) || (where.tokenHash && pending.tokenHash !== where.tokenHash) || (where.attempts?.lt != null && pending.attempts >= where.attempts.lt) || (where.expiresAt?.gt && pending.expiresAt <= where.expiresAt.gt)) return { count: 0 };
      pending = { ...pending, ...data, attempts: data.attempts?.increment ? pending.attempts + data.attempts.increment : pending.attempts };
      return { count: 1 };
    },
    delete: async () => { pending = null; },
  },
  $transaction: async (callback) => callback(prisma),
};

require.cache[require.resolve("../src/config/prisma")] = { exports: prisma };
require.cache[require.resolve("../src/config/nodemailer")] = {
  exports: { sendMail: async (message) => sent.push(message) },
};
const registration = require("../src/services/studentRegistration.service");

const validInput = {
  name: "Test Student", email: "Test@Example.com", password: "secret123",
  studentPhone: "+201234567890", otherSchoolName: "Sample School",
  desiredYearId: "year-1", fatherName: "Father", fatherPhone: "+201234567891",
};

test("student account is created only after email code verification", async () => {
  process.env.FRONTEND_URL = "https://example.com";
  process.env.EMAIL_USER = "sender@example.com";
  process.env.EMAIL_APP_PASSWORD = "test-password";
  await registration.registerStudent(validInput);
  assert.equal(student, null);
  assert.equal(pending.email, "test@example.com");
  assert.ok(!JSON.stringify(pending.details).includes("secret123"));
  assert.match(sent[0].text, /verify-email\/[a-f0-9]{64}/);
  const code = sent[0].text.match(/page: (\d{6})/)[1];
  await assert.rejects(() => registration.verifyStudentEmail({ email: validInput.email, code: code === "000000" ? "000001" : "000000" }), { status: 400 });
  const result = await registration.verifyStudentEmail({ email: validInput.email, code });
  assert.equal(result.email, "test@example.com");
  assert.match(result.accessCode, /^MN-/);
  assert.equal(pending, null);
  await assert.rejects(() => registration.verifyStudentEmail({ email: validInput.email, code }), { status: 400 });
});

test("an email link also verifies a pending account once", async () => {
  student = null;
  sent = [];
  await registration.registerStudent({ ...validInput, email: "link@example.com" });
  const token = sent[0].text.match(/verify-email\/([a-f0-9]{64})/)[1];
  const result = await registration.verifyStudentEmail({ token });
  assert.equal(result.email, "link@example.com");
  await assert.rejects(() => registration.verifyStudentEmail({ token }), { status: 400 });
});

test("codes expire and repeated wrong guesses are limited", async () => {
  student = null;
  sent = [];
  await registration.registerStudent({ ...validInput, email: "limits@example.com" });
  const correctCode = sent[0].text.match(/page: (\d{6})/)[1];
  const wrongCode = correctCode === "000000" ? "000001" : "000000";
  for (let index = 0; index < 5; index += 1) {
    await assert.rejects(() => registration.verifyStudentEmail({ email: "limits@example.com", code: wrongCode }), { status: 400 });
  }
  await assert.rejects(() => registration.verifyStudentEmail({ email: "limits@example.com", code: correctCode }), { status: 429 });
  assert.equal(student, null);
  pending.expiresAt = new Date(0);
  const token = sent[0].text.match(/verify-email\/([a-f0-9]{64})/)[1];
  await assert.rejects(() => registration.verifyStudentEmail({ token }), { status: 400 });
});

test("a second registration cannot silently reuse someone else's pending details", async () => {
  student = null;
  pending = null;
  sent = [];
  await registration.registerStudent({ ...validInput, email: "shared@example.com", name: "Original" });
  await assert.rejects(
    () => registration.registerStudent({ ...validInput, email: "shared@example.com", name: "Different" }),
    { status: 429 },
  );
  assert.equal(pending.details.name, "Original");
  assert.equal(sent.length, 1);
});
