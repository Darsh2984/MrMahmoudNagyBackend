const crypto = require("crypto");

/**
 * Generates a human-friendly access code for students/parents, e.g. "MN-7K3F9Q".
 * Format decision pending final confirmation from Mr. Nagy (see PROJECT_SPEC.md section 7) —
 * this is a reasonable default: short enough to read aloud, unambiguous charset (no 0/O/1/I).
 */
function generateAccessCode(prefix = "MN") {
  const charset = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O/1/I to avoid confusion
  let code = "";
  for (let i = 0; i < 6; i++) {
    code += charset[crypto.randomInt(0, charset.length)];
  }
  return `${prefix}-${code}`;
}

module.exports = { generateAccessCode };
