const jwt = require("jsonwebtoken");
const prisma = require("../config/prisma");

/**
 * Verifies the JWT (if present) and attaches the full user record to req.user.
 * Public routes still work (req.user will be null) — protected routes should
 * use `requireAuth` from rbac.middleware.js on top of this.
 */
module.exports = async function authenticate(req, res, next) {
  try {
    const header = req.headers.authorization || "";
    const token = header.startsWith("Bearer ") ? header.slice(7) : null;

    if (!token) {
      req.user = null;
      return next();
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await prisma.user.findUnique({ where: { id: decoded.id } });
    req.user = user || null;
    next();
  } catch (err) {
    req.user = null;
    next();
  }
};
