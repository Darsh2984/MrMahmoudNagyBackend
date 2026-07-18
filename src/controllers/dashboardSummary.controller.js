const dashboardSummaryService = require("../services/dashboardSummary.service");
const { resolveTeacherId } = require("../utils/resolveTeacher");

async function getTeacherSummary(req, res) {
  try {
    const teacherId = await resolveTeacherId(req.user);
    const summary = await dashboardSummaryService.getTeacherDashboardSummary(teacherId);
    res.json(summary);
  } catch (err) {
    res.status(err.status || 500).json({ msg: err.msg || "Error fetching dashboard summary" });
  }
}

module.exports = { getTeacherSummary };
