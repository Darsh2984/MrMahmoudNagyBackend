const prisma = require("../config/prisma");
const { assertTicketAccess } = require("./ticket.service");
const { notify } = require("./notification.service");
const {
  uploadBuffer,
  deleteFile,
} = require("./storage.service");

const MESSAGE_SENDER_SELECT = {
  id: true,
  name: true,
  role: true,
  isHeadAssistant: true,
};

function normalizeText(value) {
  return typeof value === "string" ? value.trim() : "";
}

function resolveMessageType(file, requestedType) {
  if (!file) {
    return "TEXT";
  }

  if (requestedType === "AUDIO") {
    if (!file.mimetype.startsWith("audio/")) {
      throw {
        status: 400,
        msg: "A voice message must contain an audio attachment.",
      };
    }

    return "AUDIO";
  }

  if (file.mimetype === "application/pdf") {
    return "PDF";
  }

  if (file.mimetype.startsWith("image/")) {
    return "IMAGE";
  }

  if (file.mimetype.startsWith("video/")) {
    return "VIDEO";
  }

  if (file.mimetype.startsWith("audio/")) {
    return "AUDIO";
  }

  return "FILE";
}

function getSenderType(sender) {
  return sender.role === "STUDENT"
    ? "STUDENT"
    : "ASSISTANT";
}

function buildNotificationPreview({
  content,
  messageType,
  attachmentName,
}) {
  if (content) {
    return content.length > 100
      ? `${content.slice(0, 100)}…`
      : content;
  }

  switch (messageType) {
    case "IMAGE":
      return "Sent an image";

    case "PDF":
      return `Sent a PDF${attachmentName ? `: ${attachmentName}` : ""}`;

    case "VIDEO":
      return "Sent a video";

    case "AUDIO":
      return "Sent a voice message";

    default:
      return "Sent an attachment";
  }
}

async function sendMessage({
  ticketId,
  sender,
  content,
  file,
  requestedMessageType,
  audioDuration,
  io,
}) {
  const ticket = await prisma.ticket.findUnique({
    where: {
      id: ticketId,
    },
  });

  if (!ticket) {
    throw {
      status: 404,
      msg: "Ticket not found",
    };
  }

  assertTicketAccess(ticket, sender);

  const normalizedContent = normalizeText(content);

  if (!normalizedContent && !file) {
    throw {
      status: 400,
      msg: "Write a message or attach a file.",
    };
  }

  const messageType = resolveMessageType(
    file,
    requestedMessageType
  );

  const parsedAudioDuration =
    audioDuration !== undefined &&
    audioDuration !== null &&
    audioDuration !== ""
      ? Number(audioDuration)
      : null;

  if (
    parsedAudioDuration !== null &&
    (!Number.isFinite(parsedAudioDuration) ||
      parsedAudioDuration < 0)
  ) {
    throw {
      status: 400,
      msg: "Invalid audio duration.",
    };
  }

  let attachmentUrl = null;

  try {
    if (file) {
      attachmentUrl = await uploadBuffer(
        file.buffer,
        file.originalname,
        file.mimetype,
        `tickets/${ticketId}`
      );
    }

    const message = await prisma.$transaction(
      async (transaction) => {
        const createdMessage =
          await transaction.ticketMessage.create({
            data: {
              ticketId,
              senderId: sender.id,
              senderType: getSenderType(sender),

              messageType,

              content: normalizedContent || null,

              attachmentUrl,
              attachmentName: file?.originalname || null,
              attachmentMimeType: file?.mimetype || null,
              attachmentSize: file?.size || null,

              audioDuration:
                messageType === "AUDIO"
                  ? Math.round(parsedAudioDuration || 0)
                  : null,
            },

            include: {
              sender: {
                select: MESSAGE_SENDER_SELECT,
              },
            },
          });

        await transaction.ticket.update({
          where: {
            id: ticketId,
          },

          data: {
            updatedAt: new Date(),
          },
        });

        return createdMessage;
      }
    );

    if (io) {
      io.to(ticketId).emit(
        "new-ticket-message",
        message
      );
    }

    const notifyUserId =
      sender.role === "STUDENT"
        ? ticket.assignedAssistantId
        : ticket.createdById;

    if (notifyUserId) {
      const notificationBody =
        buildNotificationPreview({
          content: normalizedContent,
          messageType,
          attachmentName:
            file?.originalname || null,
        });

      notify({
        userId: notifyUserId,
        type: "TICKET_REPLY",
        title: `${sender.name} replied to your ticket`,
        body: notificationBody,
        link: `/tickets/${ticketId}`,
      }).catch((err) => {
        console.error(
          "notify() failed:",
          err.message
        );
      });
    }

    return message;
  } catch (error) {
    if (attachmentUrl) {
      await deleteFile(attachmentUrl);
    }

    throw error;
  }
}

module.exports = {
  sendMessage,
};