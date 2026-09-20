const test = require("node:test");
const assert = require("node:assert/strict");
const { renderEmail } = require("../src/utils/emailTemplate");

test("branded email is mobile-friendly and safely escapes personal details", () => {
  const html = renderEmail({
    preview: "Your code is inside",
    eyebrow: "Student registration",
    title: "Verify your email",
    name: "Student <script>alert('x')</script>",
    message: "Finish registration",
    buttonLabel: "Verify email address",
    buttonUrl: "https://example.com/verify-email/token?one=1&two=2",
    code: "045201",
    expiresInMinutes: 30,
    securityNote: "Ignore if unexpected.",
  });

  assert.match(html, /viewport/);
  assert.match(html, /role="presentation"/);
  assert.match(html, /#0B3C49/);
  assert.match(html, /045201/);
  assert.match(html, /one=1&amp;two=2/);
  assert.match(html, /Student &lt;script&gt;alert\(&#39;x&#39;\)&lt;\/script&gt;/);
  assert.doesNotMatch(html, /<script>/);
});

test("password reset emails omit the code block", () => {
  const html = renderEmail({
    preview: "Reset your password",
    eyebrow: "Account security",
    title: "Reset your password",
    name: "Student",
    message: "Choose a new password.",
    buttonLabel: "Reset password",
    buttonUrl: "https://example.com/reset-password/token",
    expiresInMinutes: 15,
    securityNote: "Ignore if unexpected.",
  });

  assert.doesNotMatch(html, /OR ENTER THIS CODE/);
  assert.match(html, /15 minutes/);
  assert.match(html, /Reset password/);
});
