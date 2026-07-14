// One-time script to create Mr. Nagy's Teacher account — the only account in the
// whole system with no API path to create it (assistants require an existing
// Teacher to create them; students self-register; but the first Teacher has to
// come from somewhere). Run this once: `node prisma/seed.js`
//
// Set these in your .env before running:
//   TEACHER_NAME=Mahmoud Nagy
//   TEACHER_EMAIL=mahmoud@example.com
//   TEACHER_PASSWORD=pick-a-real-password

require("dotenv").config();
const bcrypt = require("bcryptjs");
const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

async function main() {
  const email = (process.env.TEACHER_EMAIL || "").toLowerCase();
  const password = process.env.TEACHER_PASSWORD;
  const name = process.env.TEACHER_NAME || "Mahmoud Nagy";

  if (!email || !password) {
    console.error("Set TEACHER_EMAIL and TEACHER_PASSWORD in .env before running this script.");
    process.exit(1);
  }

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    console.log(`A user with email ${email} already exists (role: ${existing.role}) — nothing to do.`);
    return;
  }

  const hashed = await bcrypt.hash(password, 10);
  const teacher = await prisma.user.create({
    data: { name, email, password: hashed, role: "TEACHER" },
  });

  console.log(`Teacher account created: ${teacher.email} (id: ${teacher.id})`);
  console.log("You can log in with the email/password you set in .env.");
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
