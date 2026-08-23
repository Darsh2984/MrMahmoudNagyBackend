const groupService = require("../services/group.service");

async function createGroup(req, res) {
  try {
    const group = await groupService.createGroup(req.body);
    res.json({ msg: "Group created", group });
  } catch (err) {
    res.status(err.status || 500).json({ msg: err.msg || "Error creating group" });
  }
}

async function listGroupsByYear(req, res) {
  try {
    const groups = await groupService.listGroupsByYear(
      req.params.yearId,
      req.user
    );

    res.json(groups);
  } catch (err) {
    res
      .status(err.status || 500)
      .json({
        msg: err.msg || "Error listing groups",
      });
  }
}

async function getGroup(req, res) {
  try {
    const group = await groupService.getGroupWithMembers(
      req.params.groupId,
      req.user
    );

    res.json(group);
  } catch (err) {
    res
      .status(err.status || 500)
      .json({
        msg: err.msg || "Error fetching group",
      });
  }
}


async function updateGroup(req, res) {
  try {
    const group = await groupService.updateGroup(req.params.groupId, req.body);
    res.json({ msg: "Group updated", group });
  } catch (err) {
    res.status(err.status || 500).json({ msg: err.msg || "Error updating group" });
  }
}

async function deleteGroup(req, res) {
  try {
    await groupService.deleteGroup(req.params.groupId);
    res.json({ msg: "Group deleted" });
  } catch (err) {
    res.status(err.status || 500).json({ msg: err.msg || "Error deleting group" });
  }
}

async function addStudent(req, res) {
  try {
    const membership = await groupService.addStudentToGroup({
      groupId: req.params.groupId,
      studentId: req.body.studentId,
    });
    res.json({ msg: "Student added to group", membership });
  } catch (err) {
    res.status(err.status || 500).json({ msg: err.msg || "Error adding student to group" });
  }
}

async function removeStudent(req, res) {
  try {
    await groupService.removeStudentFromGroup({
      groupId: req.params.groupId,
      studentId: req.params.studentId,
    });
    res.json({ msg: "Student removed from group" });
  } catch (err) {
    res.status(err.status || 500).json({ msg: err.msg || "Error removing student from group" });
  }
}

async function updateSessionLink(req, res) {
  try {
    const group = await groupService.updateGroupSessionLink(
      req.params.groupId,
      req.body.sessionLink
    );

    res.json(group);
  } catch (error) {
    console.error(
      "updateSessionLink error:",
      error
    );

    res.status(error.status || 500).json({
      msg:
        error.msg ||
        error.message ||
        "Failed to update session link.",
    });
  }
}

module.exports = {
  createGroup,
  listGroupsByYear,
  getGroup,
  updateGroup,
  deleteGroup,
  addStudent,
  removeStudent,
  updateSessionLink,
};
