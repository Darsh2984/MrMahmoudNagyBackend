const adminService = require("../services/admin.service");

async function listStudentActivity(req, res) {
  try {
    const result = await adminService.listStudentActivity({
      page: req.query.page,
      limit: req.query.limit,
      outcome: req.query.outcome,
      search: req.query.search,
    });

    return res.json(result);
  } catch (err) {
    return res.status(err.status || 500).json({
      msg: err.msg || err.message || "Error loading student activity",
    });
  }
}

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

module.exports = { listStudentActivity, exportUsers, exportStudents };
