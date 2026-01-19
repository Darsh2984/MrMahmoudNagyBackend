export function requireAuth(req, res, next) {
  if (!req.user) return res.status(401).json({ message: "Unauthorized" });
  next();
}

export function requireAdminTeacher(req, res, next) {
  if (req.user.role !== "teacher" || req.user.assistantof !== null) {
    return res.status(403).json({ message: "Admin teacher only" });
  }
  next();
}

export function requireAssistant(req, res, next) {
  if (req.user.role !== "teacher" || req.user.assistantof === null) {
    return res.status(403).json({ message: "Assistant only" });
  }
  next();
}
