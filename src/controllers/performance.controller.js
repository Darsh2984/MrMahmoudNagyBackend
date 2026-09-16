const performanceService = require("../services/performance.service");
const groupService = require("../services/group.service");

async function getStudentPerformance(req, res) {
  try {
    const performance = await performanceService.getStudentPerformance(req.params.studentId, req.params.groupId);
    res.json(performance);
  } catch (err) {
    res.status(err.status || 500).json({ msg: err.msg || "Error fetching performance" });
  }
}

async function exportGroupPerformance(req, res) {
  try {
    await groupService.getGroupWithMembers(req.params.groupId, req.user);
    const { workbook, groupName } = await performanceService.exportGroupPerformanceWorkbook(req.params.groupId);
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename=${groupName}_performance.xlsx`);
    await workbook.xlsx.write(res);
    res.end();
  } catch (err) {
    res.status(err.status || 500).json({ msg: err.msg || "Error exporting performance" });
  }
}

module.exports = { getStudentPerformance, exportGroupPerformance };
