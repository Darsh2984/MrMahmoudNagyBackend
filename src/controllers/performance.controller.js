const performanceService = require("../services/performance.service");
const groupService = require("../services/group.service");
const prisma = require("../config/prisma");
const { resolveTeacherId } = require("../utils/resolveTeacher");
const reportService = require("../services/performanceReport.service");

async function getStudentPerformance(req, res) {
  try {
    const group = await groupService.getGroupWithMembers(req.params.groupId, req.user);
    if (!group.members.some((member) => member.studentId === req.params.studentId)) {
      return res.status(403).json({ msg: "This student is not in the selected group." });
    }
    if (req.user.role === "STUDENT" && req.user.id !== req.params.studentId) {
      return res.status(403).json({ msg: "You can view only your own performance." });
    }
    const performance = await performanceService.getStudentPerformance(req.params.studentId, req.params.groupId);
    res.json(performance);
  } catch (err) {
    res.status(err.status || 500).json({ msg: err.msg || "Error fetching performance" });
  }
}

async function exportStudentReports(req, res) {
  try {
    const period = reportService.parsePeriod(req.query.startDate, req.query.endDate);
    const group = await groupService.getGroupWithMembers(req.params.groupId, req.user);
    const teacherId = await resolveTeacherId(req.user);
    const year = await prisma.year.findUnique({
      where: { id: group.yearId },
      select: { teacherId: true },
    });
    if (!year || year.teacherId !== teacherId) {
      return res.status(403).json({ msg: "This group does not belong to your academic years." });
    }

    const rawIds = String(req.query.studentIds || "");
    if (rawIds.length > 10000) {
      return res.status(400).json({ msg: "Too many student IDs were supplied." });
    }
    const members = group.members.filter((member) => member.student);
    const available = new Set(members.map((member) => member.studentId));
    const selectedIds = rawIds === "all"
      ? [...available]
      : [...new Set(rawIds.split(",").map((id) => id.trim()).filter(Boolean))];

    if (!selectedIds.length) {
      return res.status(400).json({ msg: "Select at least one student for the report." });
    }
    if (selectedIds.some((id) => !available.has(id))) {
      return res.status(403).json({ msg: "One or more selected students are not in this group." });
    }

    const students = members
      .filter((member) => selectedIds.includes(member.studentId))
      .map((member) => member.student)
      .sort((a, b) => a.name.localeCompare(b.name));
    const reports = await reportService.loadGroupReports(group, students, period);
    const download = await reportService.createReportsDownload(reports);
    res.setHeader("Content-Type", download.contentType);
    res.setHeader("Content-Length", download.body.length);
    res.setHeader("Content-Disposition", `attachment; filename="student-performance.${reports.length === 1 ? "pdf" : "zip"}"; filename*=UTF-8''${encodeURIComponent(download.fileName)}`);
    return res.end(download.body);
  } catch (err) {
    console.error("Performance PDF export failed:", err);
    return res.status(err.status || 500).json({ msg: err.msg || "Could not generate student reports." });
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

module.exports = { getStudentPerformance, exportGroupPerformance, exportStudentReports };
