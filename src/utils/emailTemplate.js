const COLORS = {
  teal: "#0B3C49",
  cream: "#F5F1EB",
  green: "#8BAA91",
  text: "#33312E",
  muted: "#6B6862",
  border: "#E4E0D8",
};

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[character]);
}

function renderEmail({
  preview,
  eyebrow,
  title,
  name,
  message,
  buttonLabel,
  buttonUrl,
  code,
  expiresInMinutes,
  securityNote,
}) {
  const safeUrl = escapeHtml(buttonUrl);
  const codeSection = code ? `
    <tr><td style="padding:0 32px 24px;">
      <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border:1px solid ${COLORS.border};border-radius:12px;background-color:${COLORS.cream};">
        <tr><td align="center" style="padding:20px 16px 6px;font-family:Arial,sans-serif;font-size:12px;line-height:18px;letter-spacing:1.5px;font-weight:700;color:${COLORS.muted};">OR ENTER THIS CODE</td></tr>
        <tr><td align="center" style="padding:0 16px 20px;font-family:Arial,sans-serif;font-size:30px;line-height:38px;letter-spacing:6px;font-weight:800;color:${COLORS.teal};">${escapeHtml(code)}</td></tr>
      </table>
    </td></tr>` : "";

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="color-scheme" content="light">
  <title>${escapeHtml(title)}</title>
</head>
<body style="margin:0;padding:0;background-color:${COLORS.cream};">
  <div style="display:none;font-size:1px;line-height:1px;color:${COLORS.cream};max-height:0;max-width:0;opacity:0;overflow:hidden;">${escapeHtml(preview)}</div>
  <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="background-color:${COLORS.cream};">
    <tr><td align="center" style="padding:28px 12px 40px;">
      <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="width:100%;max-width:600px;border:1px solid ${COLORS.border};border-radius:16px;background-color:#FFFFFF;">
        <tr><td style="padding:24px 32px;background-color:${COLORS.teal};border-radius:15px 15px 0 0;">
          <table role="presentation" cellpadding="0" cellspacing="0" width="100%"><tr>
            <td width="46" valign="middle"><div style="width:42px;height:42px;border-radius:10px;background-color:${COLORS.green};text-align:center;line-height:42px;font-family:Arial,sans-serif;font-size:17px;font-weight:800;color:${COLORS.teal};">MN</div></td>
            <td valign="middle" style="padding-left:12px;font-family:Arial,sans-serif;font-size:17px;line-height:23px;font-weight:700;color:#FFFFFF;">Mahmoud Nagy<br><span style="font-size:12px;font-weight:400;letter-spacing:1px;color:#D9E8E2;">STUDENT PLATFORM</span></td>
          </tr></table>
        </td></tr>
        <tr><td style="padding:32px 32px 8px;font-family:Arial,sans-serif;">
          <p style="margin:0 0 10px;font-size:12px;line-height:18px;letter-spacing:1.5px;font-weight:700;color:${COLORS.teal};">${escapeHtml(eyebrow).toUpperCase()}</p>
          <h1 style="margin:0 0 20px;font-size:28px;line-height:35px;font-weight:700;color:${COLORS.teal};">${escapeHtml(title)}</h1>
          <p style="margin:0 0 14px;font-size:16px;line-height:25px;color:${COLORS.text};">Hello ${escapeHtml(name || "there")},</p>
          <p style="margin:0 0 24px;font-size:16px;line-height:25px;color:${COLORS.text};">${escapeHtml(message)}</p>
        </td></tr>
        <tr><td style="padding:0 32px 24px;">
          <table role="presentation" cellpadding="0" cellspacing="0"><tr><td bgcolor="${COLORS.teal}" style="border-radius:9px;background-color:${COLORS.teal};">
            <a href="${safeUrl}" style="display:inline-block;padding:14px 24px;font-family:Arial,sans-serif;font-size:16px;line-height:22px;font-weight:700;color:#FFFFFF;text-decoration:none;">${escapeHtml(buttonLabel)}</a>
          </td></tr></table>
        </td></tr>${codeSection}
        <tr><td style="padding:0 32px 22px;font-family:Arial,sans-serif;">
          <p style="margin:0;padding:13px 16px;border-left:3px solid ${COLORS.green};background-color:#F8FAF8;font-size:14px;line-height:22px;color:${COLORS.text};">This link${code ? " and code" : ""} expires in <strong>${Number(expiresInMinutes)} minutes</strong> and can only be used once.</p>
        </td></tr>
        <tr><td style="padding:0 32px 28px;font-family:Arial,sans-serif;">
          <p style="margin:0 0 10px;font-size:13px;line-height:20px;color:${COLORS.muted};">If the button does not work, copy this link into your browser:</p>
          <p style="margin:0;font-size:13px;line-height:20px;word-break:break-all;"><a href="${safeUrl}" style="color:${COLORS.teal};text-decoration:underline;">${safeUrl}</a></p>
        </td></tr>
        <tr><td style="padding:20px 32px;border-top:1px solid ${COLORS.border};font-family:Arial,sans-serif;">
          <p style="margin:0;font-size:13px;line-height:21px;color:${COLORS.muted};">${escapeHtml(securityNote)}</p>
        </td></tr>
      </table>
      <p style="margin:18px 0 0;font-family:Arial,sans-serif;font-size:12px;line-height:18px;color:${COLORS.muted};">Mahmoud Nagy Student Platform · Automated message</p>
    </td></tr>
  </table>
</body>
</html>`;
}

module.exports = { renderEmail, escapeHtml };
