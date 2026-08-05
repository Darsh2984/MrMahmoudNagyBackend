const nodemailer = require("nodemailer");

const emailUser = String(
  process.env.EMAIL_USER || "",
).trim();

const emailPassword = String(
  process.env.EMAIL_APP_PASSWORD || "",
)
  .replace(/\s+/g, "")
  .trim();

if (!emailUser) {
  console.warn(
    "[Email] EMAIL_USER is not configured.",
  );
}

if (!emailPassword) {
  console.warn(
    "[Email] EMAIL_APP_PASSWORD is not configured.",
  );
}

const transporter = nodemailer.createTransport({
  host: "smtp.gmail.com",
  port: 465,
  secure: true,

  auth: {
    user: emailUser,
    pass: emailPassword,
  },

  connectionTimeout: 20_000,
  greetingTimeout: 20_000,
  socketTimeout: 30_000,
});

async function verifyEmailConnection() {
  if (!emailUser || !emailPassword) {
    return false;
  }

  try {
    await transporter.verify();

    console.log(
      "[Email] Gmail SMTP connection verified.",
    );

    return true;
  } catch (error) {
    console.error(
      "[Email] Gmail SMTP verification failed:",
      error?.message || error,
    );

    return false;
  }
}

module.exports = transporter;
module.exports.verifyEmailConnection =
  verifyEmailConnection;