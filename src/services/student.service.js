const prisma = require("../config/prisma");

/** Teacher/Head only: set a student's attendance mode (ONGROUND / ONLINE), per spec req #11. */
async function setAttendanceMode(studentId, attendanceMode) {
  if (!["ONGROUND", "ONLINE"].includes(attendanceMode)) {
    throw { status: 400, msg: "attendanceMode must be ONGROUND or ONLINE" };
  }
  const student = await prisma.user.findUnique({ where: { id: studentId } });
  if (!student || student.role !== "STUDENT") throw { status: 404, msg: "Student not found" };

  return prisma.user.update({
    where: { id: studentId },
    data: { attendanceMode },
    select: { id: true, name: true, attendanceMode: true },
  });
}

async function getStudentProfile(studentId) {
  const student = await prisma.user.findUnique({
    where: { id: studentId },
    select: {
      id: true,
      name: true,
      email: true,
      attendanceMode: true,
      accessCode: true,
      schoolId: true,
      groupMemberships: {
        include: { group: { select: { id: true, name: true, year: { select: { id: true, name: true } } } } },
      },
    },
  });
  if (!student || student.role !== "STUDENT") throw { status: 404, msg: "Student not found" };
  return student;
}

/** Students not yet in any group — no parent-account creation logic anymore (access-code model instead). */
async function listUnassignedStudents() {
  return prisma.user.findMany({
    where: { role: "STUDENT", groupMemberships: { none: {} } },
    select: { id: true, name: true, email: true, accessCode: true, schoolId: true },
  });
}

/**
 * Updates a student's own fields plus their parent contact info — the old system
 * managed a separate Parent user record here; that's gone now (access-code model),
 * so parentName/parentPhone are just plain fields on the student.
 */
async function updateStudent(studentId, { name, email, studentPhone, parentName, parentPhone }) {
  const student = await prisma.user.findUnique({ where: { id: studentId } });
  if (!student || student.role !== "STUDENT") throw { status: 404, msg: "Student not found" };

  return prisma.user.update({
    where: { id: studentId },
    data: {
      ...(name ? { name } : {}),
      ...(email ? { email: email.toLowerCase() } : {}),
      ...(studentPhone ? { phone: studentPhone } : {}),
      ...(parentName ? { parentName } : {}),
      ...(parentPhone ? { parentPhone } : {}),
    },
  });
}

async function deleteStudent(studentId) {
  const student = await prisma.user.findUnique({ where: { id: studentId } });
  if (!student || student.role !== "STUDENT") throw { status: 404, msg: "Student not found" };
  return prisma.user.delete({ where: { id: studentId } });
}

module.exports = { setAttendanceMode, getStudentProfile, listUnassignedStudents, updateStudent, deleteStudent };
