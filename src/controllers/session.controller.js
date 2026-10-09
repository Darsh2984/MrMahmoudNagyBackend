const sessionService = require("../services/session.service");
const { resolveTeacherId } = require("../utils/resolveTeacher");

async function createSession(req, res) {
  try {
    const teacherId = await resolveTeacherId(req.user);

    const session = await sessionService.createSession({
      ...req.body,
      teacherId,
    });

    res.status(201).json({
      msg: "Session created",
      session,
    });
  } catch (err) {
    console.error("createSession error:", err);

    res.status(err.status || 500).json({
      msg: err.msg || "Error creating session",
    });
  }
}

async function listSessionsByGroup(req, res) {
  try {
    const sessions = await sessionService.listSessionsByGroup(
      req.params.groupId,
      req.user,
    );

    res.json(sessions);
  } catch (err) {
    console.error("listSessionsByGroup error:", err);

    res.status(err.status || 500).json({
      msg: err.msg || "Error listing sessions",
    });
  }
}

async function getSession(req, res) {
  try {
    const session =
      await sessionService.getSessionWithDetails(
        req.params.sessionId,
        req.user
      );

    res.json(session);
  } catch (err) {
    console.error("getSession error:", err);

    res.status(err.status || 500).json({
      msg: err.msg || "Error fetching session",
    });
  }
}

async function updateSession(req, res) {
  try {
    const session = await sessionService.updateSession(
      req.params.sessionId,
      {
        title: req.body.title,
        date: req.body.date,
      }
    );

    res.json({
      msg: "Session updated",
      session,
    });
  } catch (err) {
    console.error("updateSession error:", err);

    res.status(err.status || 500).json({
      msg: err.msg || "Error updating session",
    });
  }
}

async function deleteSession(req, res) {
  try {
    await sessionService.deleteSession(req.params.sessionId);

    res.json({
      msg: "Session deleted",
    });
  } catch (err) {
    console.error("deleteSession error:", err);

    res.status(err.status || 500).json({
      msg: err.msg || "Error deleting session",
    });
  }
}

async function markAttendance(req, res) {
  try {
    const result = await sessionService.markAttendance(
      req.params.sessionId,
      req.body.records
    );

    res.json({
      msg: "Attendance recorded",
      result,
    });
  } catch (err) {
    console.error("markAttendance error:", err);

    res.status(err.status || 500).json({
      msg: err.msg || "Error marking attendance",
    });
  }
}

async function exportSessionReport(req, res) {
  try {
    const buffer = await sessionService.exportSessionReport(req.params.sessionId, req.user);
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", 'attachment; filename="session-report.pdf"');
    res.setHeader("Cache-Control", "private, no-store");
    res.send(buffer);
  } catch (error) {
    console.error("Session report export failed:", error);
    res.status(error.status || 500).json({ msg: error.msg || "Could not export the session report." });
  }
}

module.exports = {
  exportSessionReport,
  createSession,
  listSessionsByGroup,
  getSession,
  updateSession,
  deleteSession,
  markAttendance,
};
