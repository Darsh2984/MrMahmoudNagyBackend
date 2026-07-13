/**
 * Role/permission enforcement.
 *
 * Hierarchy recap (see PROJECT_SPEC.md section 4):
 *   TEACHER              - full control. Only role that can create/delete ASSISTANT
 *                          accounts and promote/demote an assistant to Head of Assistants.
 *   ASSISTANT (isHeadAssistant=true)
 *                        - a "Head of Assistants". Same admin-level access as TEACHER
 *                          for everything EXCEPT creating/removing assistant accounts.
 *                          Still does normal assistant work (grading, tickets, etc.) —
 *                          being a head does not remove their own assistant duties.
 *   ASSISTANT (isHeadAssistant=false)
 *                        - permissions individually controlled via user.permissions JSON.
 *   STUDENT              - resource access only.
 *
 * Use `requireTeacherOnly` on assistant-account management routes (create/delete
 * assistant, promote/demote to head) and `requireAdminLevel` on everything else that
 * teacher + head-assistants should both be able to do.
 */

function requireAuth(req, res, next) {
  if (!req.user) return res.status(401).json({ msg: "Unauthorized" });
  next();
}

/** Restrict a route to an explicit list of roles (STUDENT/ASSISTANT/TEACHER). */
function requireRole(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ msg: "Unauthorized" });
    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ msg: `Forbidden — requires one of: ${allowedRoles.join(", ")}` });
    }
    next();
  };
}

/** TEACHER or a promoted Head-of-Assistants — the two tiers with admin-equivalent access. */
function requireAdminLevel(req, res, next) {
  if (!req.user) return res.status(401).json({ msg: "Unauthorized" });
  const isHead = req.user.role === "ASSISTANT" && req.user.isHeadAssistant;
  if (req.user.role !== "TEACHER" && !isHead) {
    return res.status(403).json({ msg: "Teacher or Head of Assistants only" });
  }
  next();
}

/** Only the Teacher — used for assistant account creation/removal and head promotion/demotion. */
function requireTeacherOnly(req, res, next) {
  if (!req.user) return res.status(401).json({ msg: "Unauthorized" });
  if (req.user.role !== "TEACHER") {
    return res.status(403).json({ msg: "Teacher only" });
  }
  next();
}

/**
 * For regular (non-head) ASSISTANT users, checks a specific permission flag in
 * user.permissions JSON. TEACHER and Head Assistants always pass — they implicitly
 * have every permission per spec ("head of assistants have all the same features
 * as the teacher").
 */
function requireAssistantPermission(permissionKey) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ msg: "Unauthorized" });

    if (req.user.role === "TEACHER") return next();
    if (req.user.role === "ASSISTANT" && req.user.isHeadAssistant) return next();

    if (req.user.role === "ASSISTANT") {
      const allowed = req.user.permissions && req.user.permissions[permissionKey] === true;
      if (!allowed) {
        return res.status(403).json({ msg: `Missing permission: ${permissionKey}` });
      }
      return next();
    }

    return res.status(403).json({ msg: "Assistants only" });
  };
}

module.exports = {
  requireAuth,
  requireRole,
  requireAdminLevel,
  requireTeacherOnly,
  requireAssistantPermission,
};
