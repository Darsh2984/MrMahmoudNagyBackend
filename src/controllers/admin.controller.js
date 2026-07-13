const adminService = require("../services/admin.service");

async function exportUsers(req, res) {
  try {
    const workbook = await adminService.exportUsersWorkbook();
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", "attachment; filename=users.xlsx");
    await workbook.xlsx.write(res);
    res.end();
  } catch (err) {
    res.status(500).json({ msg: "Error exporting users" });
  }
}

async function exportStudents(req, res) {
  try {
    const workbook = await adminService.exportStudentsWorkbook();
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", "attachment; filename=students.xlsx");
    await workbook.xlsx.write(res);
    res.end();
  } catch (err) {
    res.status(500).json({ msg: "Error exporting students" });
  }
}

module.exports = { exportUsers, exportStudents };
