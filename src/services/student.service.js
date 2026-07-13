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

module.exports = { setAttendanceMode, getStudentProfile };
