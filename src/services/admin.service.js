const ExcelJS = require("exceljs");
const prisma = require("../config/prisma");

function styleHeaderRow(worksheet) {
  const headerRow = worksheet.getRow(1);
  headerRow.font = { bold: true, color: { argb: "FFFFFFFF" } };
  headerRow.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0B3C49" } };
}

async function exportUsersWorkbook() {
  const users = await prisma.user.findMany({ include: { school: { select: { name: true } } } });

  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet("Users");
  worksheet.columns = [
    { header: "Name", key: "name", width: 25 },
    { header: "Role", key: "role", width: 15 },
    { header: "Email", key: "email", width: 30 },
    { header: "Phone Number", key: "phone", width: 20 },
    { header: "School", key: "school", width: 25 },
    { header: "Access Code", key: "accessCode", width: 15 },
    { header: "Parent Name", key: "parentName", width: 25 },
    { header: "Parent Phone", key: "parentPhone", width: 20 },
  ];

  users.forEach((u) => {
    worksheet.addRow({
      name: u.name,
      role: u.role,
      email: u.email,
      phone: u.phone || "N/A",
      school: u.school?.name || "N/A",
      accessCode: u.accessCode || "N/A",
      parentName: u.parentName || "N/A",
      parentPhone: u.parentPhone || "N/A",
    });
  });

  styleHeaderRow(worksheet);
  return workbook;
}

async function exportStudentsWorkbook() {
  const students = await prisma.user.findMany({
    where: { role: "STUDENT" },
    include: { school: { select: { name: true } } },
  });

  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet("Students");
  worksheet.columns = [
    { header: "Student Name", key: "name", width: 25 },
    { header: "Email", key: "email", width: 30 },
    { header: "Phone Number", key: "phone", width: 20 },
    { header: "School", key: "school", width: 25 },
    { header: "Access Code", key: "accessCode", width: 15 },
    { header: "Attendance Mode", key: "attendanceMode", width: 18 },
    { header: "Parent Name", key: "parentName", width: 25 },
    { header: "Parent Phone", key: "parentPhone", width: 20 },
  ];

  students.forEach((s) => {
    worksheet.addRow({
      name: s.name,
      email: s.email,
      phone: s.phone || "N/A",
      school: s.school?.name || "N/A",
      accessCode: s.accessCode || "N/A",
      attendanceMode: s.attendanceMode || "N/A",
      parentName: s.parentName || "N/A",
      parentPhone: s.parentPhone || "N/A",
    });
  });

  styleHeaderRow(worksheet);
  return workbook;
}

module.exports = { exportUsersWorkbook, exportStudentsWorkbook };
