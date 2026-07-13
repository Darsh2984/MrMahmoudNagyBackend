const authService = require("../services/auth.service");

async function registerStudent(req, res) {
  try {
    const user = await authService.registerStudent(req.body);
    res.json({ msg: "Student registered", user: { id: user.id, name: user.name, accessCode: user.accessCode } });
  } catch (err) {
    res.status(err.status || 500).json({ msg: err.msg || "Error registering student" });
  }
}

async function createAssistant(req, res) {
  try {
    const user = await authService.createAssistant(req.body);
    res.json({ msg: "Assistant created", user: { id: user.id, name: user.name } });
  } catch (err) {
    res.status(err.status || 500).json({ msg: err.msg || "Error creating assistant" });
  }
}

async function promoteToHead(req, res) {
  try {
    const user = await authService.promoteToHead(req.params.assistantId);
    res.json({ msg: "Promoted to Head of Assistants", user: { id: user.id, name: user.name } });
  } catch (err) {
    res.status(err.status || 500).json({ msg: err.msg || "Error promoting assistant" });
  }
}

async function demoteFromHead(req, res) {
  try {
    const user = await authService.demoteFromHead(req.params.assistantId, req.body.newManagedByHeadId);
    res.json({ msg: "Demoted from Head of Assistants", user: { id: user.id, name: user.name } });
  } catch (err) {
    res.status(err.status || 500).json({ msg: err.msg || "Error demoting assistant" });
  }
}

async function login(req, res) {
  try {
    const result = await authService.login(req.body);
    res.json(result);
  } catch (err) {
    res.status(err.status || 500).json({ msg: err.msg || "Error logging in" });
  }
}

async function lookupByAccessCode(req, res) {
  try {
    const student = await authService.lookupByAccessCode(req.params.code);
    res.json(student);
  } catch (err) {
    res.status(err.status || 500).json({ msg: err.msg || "Error looking up student" });
  }
}

module.exports = {
  registerStudent,
  createAssistant,
  promoteToHead,
  demoteFromHead,
  login,
  lookupByAccessCode,
};
