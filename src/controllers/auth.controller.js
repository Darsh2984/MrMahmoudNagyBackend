const authService = require("../services/auth.service");

async function registerStudent(req, res) {
  try {
    const user = await authService.registerStudent(req.body);

    res.json({
      msg: "Student registered",
      user: {
        id: user.id,
        name: user.name,
        accessCode: user.accessCode,
        desiredYear: user.desiredYear || null,
      },
    });
  } catch (err) {
    res
      .status(err.status || 500)
      .json({
        msg:
          err.msg ||
          "Error registering student",
      });
  }
}

async function listRegistrationYears(req, res) {
  try {
    const years =
      await authService.listRegistrationYears();

    res.json(years);
  } catch (err) {
    res
      .status(err.status || 500)
      .json({
        msg:
          err.msg ||
          "Error listing academic years",
      });
  }
}

async function createAssistant(req, res) {
  try {
    const user =
      await authService.createAssistant(
        req.body
      );

    res.json({
      msg: "Assistant created",
      user: {
        id: user.id,
        name: user.name,
      },
    });
  } catch (err) {
    res
      .status(err.status || 500)
      .json({
        msg:
          err.msg ||
          "Error creating assistant",
      });
  }
}

async function promoteToHead(req, res) {
  try {
    const user =
      await authService.promoteToHead(
        req.params.assistantId
      );

    res.json({
      msg: "Promoted to Head of Assistants",
      user: {
        id: user.id,
        name: user.name,
      },
    });
  } catch (err) {
    res
      .status(err.status || 500)
      .json({
        msg:
          err.msg ||
          "Error promoting assistant",
      });
  }
}

async function demoteFromHead(req, res) {
  try {
    const user =
      await authService.demoteFromHead(
        req.params.assistantId,
        req.body.newManagedByHeadId
      );

    res.json({
      msg: "Demoted from Head of Assistants",
      user: {
        id: user.id,
        name: user.name,
      },
    });
  } catch (err) {
    res
      .status(err.status || 500)
      .json({
        msg:
          err.msg ||
          "Error demoting assistant",
      });
  }
}

async function login(req, res) {
  try {
    const result = await authService.login(
      req.body
    );

    res.json(result);
  } catch (err) {
    res
      .status(err.status || 500)
      .json({
        msg:
          err.msg ||
          "Error logging in",
      });
  }
}

async function lookupByAccessCode(req, res) {
  try {
    const student =
      await authService.lookupByAccessCode(
        req.params.code
      );

    res.json(student);
  } catch (err) {
    res
      .status(err.status || 500)
      .json({
        msg:
          err.msg ||
          "Error looking up student",
      });
  }
}

async function forgotPassword(req, res) {
  try {
    const result =
      await authService.forgotPassword(
        req.body?.email
      );

    return res.json(result);
  } catch (err) {
    return res
      .status(err.status || 500)
      .json({
        msg:
          err.msg ||
          "Error sending reset email",
      });
  }
}

async function resetPassword(req, res) {
  try {
    const result =
      await authService.resetPassword(
        req.params.token,
        req.body?.password
      );

    return res.json(result);
  } catch (err) {
    return res
      .status(err.status || 500)
      .json({
        msg:
          err.msg ||
          "Error resetting password",
      });
  }
}

async function getCurrentUser(req, res) {
  try {
    const user =
      await authService.getCurrentUser(
        req.user.id
      );

    res.json(user);
  } catch (err) {
    res
      .status(err.status || 500)
      .json({
        msg:
          err.msg ||
          "Error fetching current user",
      });
  }
}

async function listAssistants(req, res) {
  try {
    const assistants =
      await authService.listAssistants();

    res.json(assistants);
  } catch (err) {
    res
      .status(err.status || 500)
      .json({
        msg:
          err.msg ||
          "Error listing assistants",
      });
  }
}

async function updateAssistantPermissions(
  req,
  res
) {
  try {
    const user =
      await authService.updateAssistantPermissions(
        req.params.assistantId,
        req.body.permissions
      );

    res.json({
      msg: "Permissions updated",
      user,
    });
  } catch (err) {
    res
      .status(err.status || 500)
      .json({
        msg:
          err.msg ||
          "Error updating permissions",
      });
  }
}

async function deleteAssistant(req, res) {
  try {
    await authService.deleteAssistant(
      req.params.assistantId
    );

    res.json({
      msg: "Assistant deleted",
    });
  } catch (err) {
    res
      .status(err.status || 500)
      .json({
        msg:
          err.msg ||
          "Error deleting assistant",
      });
  }
}

module.exports = {
  registerStudent,
  listRegistrationYears,
  createAssistant,
  promoteToHead,
  demoteFromHead,
  listAssistants,
  updateAssistantPermissions,
  deleteAssistant,
  login,
  lookupByAccessCode,
  forgotPassword,
  resetPassword,
  getCurrentUser,
};