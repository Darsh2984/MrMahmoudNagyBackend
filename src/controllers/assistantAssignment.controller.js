const assignmentService = require("../services/assistantAssignment.service");

async function assign(req, res) {
  try {
    const assignment = await assignmentService.assignAssistantToGroup(req.body);
    res.json({ msg: "Assistant assigned to group", assignment });
  } catch (err) {
    res.status(err.status || 500).json({ msg: err.msg || "Error assigning assistant" });
  }
}

async function unassign(req, res) {
  try {
    await assignmentService.unassignAssistantFromGroup({
      assistantId: req.params.assistantId,
      groupId: req.params.groupId,
    });
    res.json({ msg: "Assistant unassigned from group" });
  } catch (err) {
    res.status(err.status || 500).json({ msg: err.msg || "Error unassigning assistant" });
  }
}

async function listGroupsForAssistant(req, res) {
  try {
    const groups = await assignmentService.listGroupsForAssistant(req.params.assistantId);
    res.json(groups);
  } catch (err) {
    res.status(err.status || 500).json({ msg: err.msg || "Error listing groups" });
  }
}

async function listAssistantsForGroup(req, res) {
  try {
    const assistants = await assignmentService.listAssistantsForGroup(req.params.groupId);
    res.json(assistants);
  } catch (err) {
    res.status(err.status || 500).json({ msg: err.msg || "Error listing assistants" });
  }
}

module.exports = { assign, unassign, listGroupsForAssistant, listAssistantsForGroup };
