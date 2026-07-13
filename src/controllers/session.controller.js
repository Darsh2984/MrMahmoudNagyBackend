const sessionService = require("../services/session.service");

async function createSession(req, res) {
  try {
    const session = await sessionService.createSession({ ...req.body, teacherId: req.user.id });
    res.json({ msg: "Session created", session });
  } catch (err) {
    res.status(err.status || 500).json({ msg: err.msg || "Error creating session" });
  }
}

async function listSessionsByGroup(req, res) {
  try {
    const sessions = await sessionService.listSessionsByGroup(req.params.groupId);
    res.json(sessions);
  } catch (err) {
    res.status(err.status || 500).json({ msg: err.msg || "Error listing sessions" });
  }
}

async function getSession(req, res) {
  try {
    const session = await sessionService.getSessionWithDetails(req.params.sessionId);
    res.json(session);
  } catch (err) {
    res.status(err.status || 500).json({ msg: err.msg || "Error fetching session" });
  }
}

async function markAttendance(req, res) {
  try {
    const result = await sessionService.markAttendance(req.params.sessionId, req.body.records);
    res.json({ msg: "Attendance recorded", result });
  } catch (err) {
    res.status(err.status || 500).json({ msg: err.msg || "Error marking attendance" });
  }
}

module.exports = { createSession, listSessionsByGroup, getSession, markAttendance };
