const prisma = require("../config/prisma");

/**
 * A Head Assistant has admin-level access to everything except assistant
 * management, so they should see/act on the SAME data as the Teacher —
 * not data scoped to their own user id (which won't match any Year.teacherId,
 * Quiz.teacherId, etc, since there's only one Teacher account in this system).
 */
async function resolveTeacherId(user) {
  if (user.role === "TEACHER") return user.id;
  const teacher = await prisma.user.findFirst({ where: { role: "TEACHER" }, select: { id: true } });
  if (!teacher) throw { status: 404, msg: "No teacher account found" };
  return teacher.id;
}

module.exports = { resolveTeacherId };
