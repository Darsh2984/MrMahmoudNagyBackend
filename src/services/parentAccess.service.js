const prisma = require("../config/prisma");
const performanceService = require("./performance.service");
const studentSupportChatService = require("./studentSupportChat.service");

function createServiceError(status, msg) {
  const error = new Error(msg);

  error.status = status;
  error.msg = msg;

  return error;
}

function normalizeAccessCode(accessCode) {
  return String(accessCode || "")
    .trim()
    .toUpperCase();
}

async function getStudentByAccessCode(accessCode) {
  const normalizedCode =
    normalizeAccessCode(accessCode);

  if (!normalizedCode) {
    throw createServiceError(
      401,
      "Student access code is required."
    );
  }

  const student =
    await prisma.user.findUnique({
      where: {
        accessCode: normalizedCode,
      },

      select: {
        id: true,
        name: true,
        attendanceMode: true,
        accessCode: true,
        phone: true,
        fatherName: true,
        fatherPhone: true,
        motherName: true,
        motherPhone: true,

        groupMemberships: {
          select: {
            group: {
              select: {
                id: true,
                name: true,

                year: {
                  select: {
                    id: true,
                    name: true,
                  },
                },
              },
            },
          },
        },
      },
    });

  if (!student) {
    throw createServiceError(
      404,
      "Invalid student access code."
    );
  }

  return student;
}

async function lookup(accessCode) {
  const student =
    await getStudentByAccessCode(accessCode);

  const firstGroup =
    student.groupMemberships[0]?.group ||
    null;

  const performance =
    firstGroup?.id
      ? await performanceService
          .getStudentPerformance(
            student.id,
            firstGroup.id
          )
      : null;

  const chatResult =
    await studentSupportChatService
      .listChatsForParentAccessCode(
        student.accessCode
      );

  return {
    student,
    performance,
    chats: chatResult.chats,
  };
}

async function listChats(accessCode) {
  return studentSupportChatService
    .listChatsForParentAccessCode(
      normalizeAccessCode(accessCode)
    );
}

async function getMessages({
  accessCode,
  chatId,
  before,
  limit,
}) {
  return studentSupportChatService
    .getMessagesForParent({
      accessCode:
        normalizeAccessCode(accessCode),
      chatId,
      before,
      limit,
    });
}

async function sendMessage({
  accessCode,
  chatId,
  content,
  io
}) {
  return studentSupportChatService
    .sendMessageForParent({
      accessCode:
        normalizeAccessCode(accessCode),
      chatId,
      content,
      io
    });
}

async function markRead({
  accessCode,
  chatId,
}) {
  return studentSupportChatService
    .markReadForParent({
      accessCode:
        normalizeAccessCode(accessCode),
      chatId,
    });
}

module.exports = {
  lookup,
  listChats,
  getMessages,
  sendMessage,
  markRead,
};