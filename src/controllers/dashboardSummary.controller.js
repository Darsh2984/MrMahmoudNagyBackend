const prisma = require("../config/prisma");
const dashboardSummaryService = require("../services/dashboardSummary.service");

async function getTeacherSummary(req, res) {
  try {
    // A Head Assistant has admin-level access to everything except assistant
    // management, so they see the SAME dashboard as the Teacher — not a query
    // scoped to their own id (which wouldn't match any Year.teacherId at all).
    let teacherId = req.user.id;
    if (req.user.role !== "TEACHER") {
      const teacher = await prisma.user.findFirst({ where: { role: "TEACHER" }, select: { id: true } });
      if (!teacher) throw { status: 404, msg: "No teacher account found" };
      teacherId = teacher.id;
    }

    const summary = await dashboardSummaryService.getTeacherDashboardSummary(teacherId);
    res.json(summary);
  } catch (err) {
    res.status(err.status || 500).json({ msg: err.msg || "Error fetching dashboard summary" });
  }
}

module.exports = { getTeacherSummary };
