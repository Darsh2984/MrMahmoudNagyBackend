const prisma = require("../config/prisma");
const transporter = require("../config/nodemailer");
const { renderNotificationEmail } = require("../utils/emailTemplate");
const { notify } = require("./notification.service");

function appLink(path) {
  const base = String(process.env.FRONTEND_URL || "").trim().replace(/\/+$/, "");
  return /^https?:\/\//i.test(base) ? `${base}${path}` : null;
}

async function sendEmail(recipient, message) {
  const from = String(process.env.EMAIL_FROM || process.env.EMAIL_USER || "").trim();
  if (!from || !recipient.email) return;

  const buttonUrl = appLink(message.link);
  await transporter.sendMail({
    from: { name: "Mahmoud Nagy's Team", address: from },
    to: recipient.email,
    subject: message.emailSubject || message.title,
    text: `Hello ${recipient.name || "there"},\n\n${message.emailMessage || message.body}${message.note ? `\n\n${message.note}` : ""}${buttonUrl ? `\n\nOpen the platform: ${buttonUrl}` : ""}`,
    html: renderNotificationEmail({
      preview: message.body,
      eyebrow: message.eyebrow,
      title: message.title,
      name: recipient.name,
      message: message.emailMessage || message.body,
      note: message.note,
      buttonLabel: buttonUrl ? (message.buttonLabel || "Open the platform") : null,
      buttonUrl,
    }),
  });
}

async function deliver(recipient, message) {
  const outcomes = await Promise.allSettled([
    notify({
      userId: recipient.id,
      type: "GENERAL",
      title: message.title,
      body: message.body,
      link: message.link,
    }),
    sendEmail(recipient, message),
  ]);
  for (const outcome of outcomes) {
    if (outcome.status === "rejected") {
      console.error("Staff alert delivery failed:", outcome.reason?.message || outcome.reason);
    }
  }
}

async function alertAssistantsOfStudentRegistration(student) {
  const assignments = await prisma.assistantGroupAssignment.findMany({
    where: { group: { yearId: student.desiredYear.id } },
    select: { assistant: { select: { id: true, name: true, email: true } } },
  });
  const recipients = [...new Map(assignments.map(({ assistant }) => [assistant.id, assistant])).values()];
  const yearName = student.desiredYear.name;
  const schoolName = student.school?.name || "Not specified";
  const message = {
    eyebrow: "New student registration",
    title: "Student awaiting group assignment",
    body: `${student.name} registered for ${yearName}. Please assign the student to the appropriate group.`,
    emailMessage: `${student.name} (${student.email}) has completed registration and selected ${yearName}. School: ${schoolName}. Please let the dedicated assistant assign this student to the appropriate group.`,
    note: `This email was sent to all assistants assigned to groups under ${yearName}.`,
    link: "/groups",
    buttonLabel: "Review students and groups",
  };
  await Promise.all(recipients.map((recipient) => deliver(recipient, message)));
}

async function alertAdminsOfHomeworkSubmission(submissionId) {
  const submission = await prisma.submission.findUnique({
    where: { id: submissionId },
    select: {
      studentId: true,
      student: { select: { name: true } },
      task: {
        select: {
          id: true,
          title: true,
          yearId: true,
          groups: { select: { groupId: true, group: { select: { name: true } } } },
        },
      },
    },
  });
  if (!submission) return;

  const groupIds = submission.task.groups.map(({ groupId }) => groupId);
  const [year, memberships, recipients] = await Promise.all([
    prisma.year.findUnique({ where: { id: submission.task.yearId }, select: { name: true } }),
    prisma.groupMembership.findMany({
      where: { studentId: submission.studentId, groupId: { in: groupIds } },
      select: { group: { select: { name: true } } },
    }),
    prisma.user.findMany({
      where: { OR: [{ role: "TEACHER" }, { role: "ASSISTANT", isHeadAssistant: true }] },
      select: { id: true, name: true, email: true },
    }),
  ]);
  const groupNames = memberships.map(({ group }) => group.name);
  const fallbackGroups = submission.task.groups.map(({ group }) => group.name);
  const groupLabel = (groupNames.length ? groupNames : fallbackGroups).join(", ") || "Unassigned group";
  const yearLabel = year?.name || "Unknown year";
  const message = {
    eyebrow: "Homework submitted",
    title: "Homework needs delegation",
    body: `${submission.student.name} submitted ${submission.task.title} (${yearLabel} · ${groupLabel}). Please delegate it to an assistant for correction.`,
    link: `/tasks/${submission.task.id}`,
    buttonLabel: "Open task submissions",
  };
  await Promise.all(recipients.map((recipient) => deliver(recipient, message)));
}

async function alertAssistantOfDelegation({ assistant, submission, title, body, count }) {
  const taskTitle = submission?.task?.title || "homework";
  await deliver(assistant, {
    eyebrow: "Homework delegation",
    title,
    body,
    emailMessage: count > 1
      ? `${count} homework submissions for ${taskTitle} have been delegated to you for correction.`
      : body,
    link: submission?.taskId ? `/tasks/${submission.taskId}` : "/tasks",
    buttonLabel: "Open delegated submissions",
  });
}

module.exports = {
  alertAssistantsOfStudentRegistration,
  alertAdminsOfHomeworkSubmission,
  alertAssistantOfDelegation,
};
