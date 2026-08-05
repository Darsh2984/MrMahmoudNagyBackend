const prisma = require(
  "../config/prisma",
);

const {
  uploadBuffer,
  deleteFile,
  getSignedUrl,
} = require("./storage.service");

const {
  assertGroupChatAccess,
  listAccessibleGroupIds,
} = require(
  "./groupChatAccess.service",
);

const MESSAGE_SENDER_SELECT = {
  id: true,
  name: true,
  role: true,
  isHeadAssistant: true,
};

function createServiceError(
  status,
  msg,
) {
  const error = new Error(msg);

  error.status = status;
  error.msg = msg;

  return error;
}

function normalizeText(value) {
  const text = String(
    value || "",
  ).trim();

  return text || null;
}

function resolveMessageType(
  file,
  requestedMessageType,
) {
  if (!file) {
    return "TEXT";
  }

  const requested = String(
    requestedMessageType || "",
  ).toUpperCase();

  if (
    [
      "IMAGE",
      "PDF",
      "VIDEO",
      "AUDIO",
      "FILE",
    ].includes(requested)
  ) {
    return requested;
  }

  const mimetype = String(
    file.mimetype || "",
  ).toLowerCase();

  if (
    mimetype.startsWith("image/")
  ) {
    return "IMAGE";
  }

  if (
    mimetype === "application/pdf"
  ) {
    return "PDF";
  }

  if (
    mimetype.startsWith("video/")
  ) {
    return "VIDEO";
  }

  if (
    mimetype.startsWith("audio/")
  ) {
    return "AUDIO";
  }

  return "FILE";
}

async function addSignedAttachment(
  message,
) {
  if (!message?.attachmentUrl) {
    return message;
  }

  return {
    ...message,

    attachmentUrl:
      await getSignedUrl(
        message.attachmentUrl,
        15,
      ),
  };
}

async function listChatsForUser(
  user,
) {
  const groupIds =
    await listAccessibleGroupIds(user);

  if (!groupIds.length) {
    return [];
  }

  const groups =
    await prisma.group.findMany({
      where: {
        id: {
          in: groupIds,
        },
      },

      orderBy: [
        {
          year: {
            name: "asc",
          },
        },
        {
          name: "asc",
        },
      ],

      select: {
        id: true,
        name: true,
        yearId: true,

        year: {
          select: {
            id: true,
            name: true,
          },
        },

        _count: {
          select: {
            members: true,
          },
        },

        chatReadStates: {
          where: {
            userId: user.id,
          },

          select: {
            lastReadAt: true,
          },

          take: 1,
        },

        chatMessages: {
          orderBy: {
            createdAt: "desc",
          },

          take: 1,

          include: {
            sender: {
              select:
                MESSAGE_SENDER_SELECT,
            },
          },
        },
      },
    });

  const results = [];

  for (const group of groups) {
    const lastReadAt =
      group.chatReadStates[0]
        ?.lastReadAt || new Date(0);

    const unreadCount =
      await prisma.groupChatMessage.count({
        where: {
          groupId: group.id,

          senderId: {
            not: user.id,
          },

          createdAt: {
            gt: lastReadAt,
          },
        },
      });

    const lastMessage =
      group.chatMessages[0]
        ? await addSignedAttachment(
            group.chatMessages[0],
          )
        : null;

    results.push({
      id: group.id,
      name: group.name,
      year: group.year,

      memberCount:
        group._count.members,

      unreadCount,

      lastReadAt:
        group.chatReadStates[0]
          ?.lastReadAt || null,

      lastMessage,
    });
  }

  return results;
}

async function getMessages({
  groupId,
  user,
  before,
  limit = 40,
}) {
  const group =
    await assertGroupChatAccess(
      groupId,
      user,
    );

  const parsedLimit = Math.min(
    Math.max(
      Number(limit) || 40,
      1,
    ),
    100,
  );

  let beforeDate = null;

  if (before) {
    beforeDate = new Date(before);

    if (
      Number.isNaN(
        beforeDate.getTime(),
      )
    ) {
      throw createServiceError(
        400,
        "Invalid pagination date.",
      );
    }
  }

  const messages =
    await prisma.groupChatMessage.findMany({
      where: {
        groupId: group.id,

        ...(beforeDate
          ? {
              createdAt: {
                lt: beforeDate,
              },
            }
          : {}),
      },

      orderBy: {
        createdAt: "desc",
      },

      take: parsedLimit + 1,

      include: {
        sender: {
          select:
            MESSAGE_SENDER_SELECT,
        },
      },
    });

  const hasMore =
    messages.length > parsedLimit;

  const page = hasMore
    ? messages.slice(
        0,
        parsedLimit,
      )
    : messages;

  const signedMessages =
    await Promise.all(
      page.map(
        addSignedAttachment,
      ),
    );

  return {
    group: {
      id: group.id,
      name: group.name,
      yearId: group.yearId,
      year: group.year,
    },

    messages:
      signedMessages.reverse(),

    hasMore,

    nextBefore:
      hasMore &&
      page.length
        ? page[
            page.length - 1
          ].createdAt
        : null,
  };
}

async function sendMessage({
  groupId,
  sender,
  content,
  file,
  requestedMessageType,
  audioDuration,
  io,
}) {
  const group =
    await assertGroupChatAccess(
      groupId,
      sender,
    );

  const normalizedContent =
    normalizeText(content);

  if (
    !normalizedContent &&
    !file
  ) {
    throw createServiceError(
      400,
      "Write a message or attach a file.",
    );
  }

  const messageType =
    resolveMessageType(
      file,
      requestedMessageType,
    );

  let parsedAudioDuration =
    null;

  if (
    audioDuration !== undefined &&
    audioDuration !== null &&
    audioDuration !== ""
  ) {
    parsedAudioDuration =
      Number(audioDuration);

    if (
      !Number.isFinite(
        parsedAudioDuration,
      ) ||
      parsedAudioDuration < 0
    ) {
      throw createServiceError(
        400,
        "Invalid audio duration.",
      );
    }
  }

  let attachmentUrl = null;

  try {
    if (file) {
      attachmentUrl =
        await uploadBuffer(
          file.buffer,
          file.originalname,
          file.mimetype,
          `group-chat/${group.id}`,
        );
    }

    const message =
      await prisma.groupChatMessage.create({
        data: {
          groupId: group.id,
          senderId: sender.id,

          messageType,

          content:
            normalizedContent,

          attachmentUrl,

          attachmentName:
            file?.originalname ||
            null,

          attachmentMimeType:
            file?.mimetype ||
            null,

          attachmentSize:
            file?.size || null,

          audioDuration:
            messageType === "AUDIO"
              ? Math.round(
                  parsedAudioDuration ||
                    0,
                )
              : null,
        },

        include: {
          sender: {
            select:
              MESSAGE_SENDER_SELECT,
          },
        },
      });

    const responseMessage =
      await addSignedAttachment(
        message,
      );

    await prisma.groupChatReadState.upsert({
      where: {
        groupId_userId: {
          groupId: group.id,
          userId: sender.id,
        },
      },

      update: {
        lastReadAt:
          message.createdAt,
      },

      create: {
        groupId: group.id,
        userId: sender.id,
        lastReadAt:
          message.createdAt,
      },
    });

    if (io) {
      io.to(
        `group-chat:${group.id}`,
      ).emit(
        "new-group-chat-message",
        {
          groupId: group.id,
          message:
            responseMessage,
        },
      );
    }

    return responseMessage;
  } catch (error) {
    if (attachmentUrl) {
      await deleteFile(
        attachmentUrl,
      );
    }

    throw error;
  }
}

async function markChatRead({
  groupId,
  user,
}) {
  const group =
    await assertGroupChatAccess(
      groupId,
      user,
    );

  const lastReadAt =
    new Date();

  await prisma.groupChatReadState.upsert({
    where: {
      groupId_userId: {
        groupId: group.id,
        userId: user.id,
      },
    },

    update: {
      lastReadAt,
    },

    create: {
      groupId: group.id,
      userId: user.id,
      lastReadAt,
    },
  });

  return {
    groupId: group.id,
    lastReadAt,
  };
}

module.exports = {
  listChatsForUser,
  getMessages,
  sendMessage,
  markChatRead,
};