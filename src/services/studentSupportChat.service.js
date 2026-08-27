const prisma = require("../config/prisma");

function createServiceError(status, msg) {
  const error = new Error(msg);

  error.status = status;
  error.msg = msg;

  return error;
}

function isAdminLevel(user) {
  return (
    user?.role === "TEACHER" ||
    (
      user?.role === "ASSISTANT" &&
      user?.isHeadAssistant === true
    )
  );
}

function normalizeText(value) {
  const text = String(value || "").trim();

  return text || null;
}

function getParentReaderKey(studentId) {
  return `PARENT:${studentId}`;
}

function getUserReaderKey(userId) {
  return `USER:${userId}`;
}

function buildParentDisplayName(student) {
  const fatherName = String(
    student?.fatherName || ""
  ).trim();

  const motherName = String(
    student?.motherName || ""
  ).trim();

  if (fatherName && motherName) {
    return `Parent of ${student.name}`;
  }

  if (fatherName) {
    return `${fatherName} - Parent of ${student.name}`;
  }

  if (motherName) {
    return `${motherName} - Parent of ${student.name}`;
  }

  return `Parent of ${student?.name || "Student"}`;
}

async function ensureStudentSupportChat({
  groupId,
  studentId,
}) {
  if (!groupId || !studentId) {
    throw createServiceError(
      400,
      "groupId and studentId are required."
    );
  }

  const membership =
    await prisma.groupMembership.findUnique({
      where: {
        groupId_studentId: {
          groupId,
          studentId,
        },
      },
      select: {
        id: true,
      },
    });

  if (!membership) {
    throw createServiceError(
      400,
      "Student must be assigned to the group before creating a support chat."
    );
  }

  return prisma.studentSupportChat.upsert({
    where: {
      groupId_studentId: {
        groupId,
        studentId,
      },
    },

    update: {},

    create: {
      groupId,
      studentId,
    },
  });
}

async function assertAuthenticatedSupportChatAccess(
  chatId,
  user
) {
  if (!user) {
    throw createServiceError(
      401,
      "Authentication required."
    );
  }

  if (!chatId) {
    throw createServiceError(
      400,
      "Chat ID is required."
    );
  }

  const chat =
    await prisma.studentSupportChat.findUnique({
      where: {
        id: String(chatId),
      },

      include: {
        student: {
          select: {
            id: true,
            name: true,
            email: true,
            accessCode: true,
            fatherName: true,
            fatherPhone: true,
            motherName: true,
            motherPhone: true,
          },
        },

        group: {
          select: {
            id: true,
            name: true,
            yearId: true,

            year: {
              select: {
                id: true,
                name: true,
                teacherId: true,
              },
            },

            members: {
              where: {
                studentId: user.id,
              },
              select: {
                id: true,
              },
              take: 1,
            },

            assistantAssignments: {
              where: {
                assistantId: user.id,
              },
              select: {
                id: true,
              },
              take: 1,
            },
          },
        },
      },
    });

  if (!chat) {
    throw createServiceError(
      404,
      "Support chat not found."
    );
  }

  if (isAdminLevel(user)) {
    return chat;
  }

  if (
    user.role === "STUDENT" &&
    chat.studentId === user.id
  ) {
    return chat;
  }

  if (
    user.role === "ASSISTANT" &&
    chat.group.assistantAssignments.length > 0
  ) {
    return chat;
  }

  throw createServiceError(
    403,
    "You do not have access to this support chat."
  );
}

async function assertParentSupportChatAccess({
  chatId,
  accessCode,
}) {
  const normalizedCode =
    String(accessCode || "")
      .trim()
      .toUpperCase();

  if (!normalizedCode) {
    throw createServiceError(
      401,
      "Student access code is required."
    );
  }

  const chat =
    await prisma.studentSupportChat.findUnique({
      where: {
        id: String(chatId || ""),
      },

      include: {
        student: {
          select: {
            id: true,
            name: true,
            accessCode: true,
            fatherName: true,
            fatherPhone: true,
            motherName: true,
            motherPhone: true,
          },
        },

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
    });

  if (!chat) {
    throw createServiceError(
      404,
      "Support chat not found."
    );
  }

  if (
    String(chat.student.accessCode || "")
      .trim()
      .toUpperCase() !== normalizedCode
  ) {
    throw createServiceError(
      403,
      "Invalid access code for this support chat."
    );
  }

  return chat;
}

async function listChatsForUser(user) {
  if (!user) {
    throw createServiceError(
      401,
      "Authentication required."
    );
  }

  const where = isAdminLevel(user)
    ? {}
    : user.role === "STUDENT"
      ? {
          studentId: user.id,
        }
      : user.role === "ASSISTANT"
        ? {
            group: {
              assistantAssignments: {
                some: {
                  assistantId: user.id,
                },
              },
            },
          }
        : {
            id: "__NO_ACCESS__",
          };

  const chats =
    await prisma.studentSupportChat.findMany({
      where,

      orderBy: {
        updatedAt: "desc",
      },

      include: {
        student: {
          select: {
            id: true,
            name: true,
            email: true,
            fatherName: true,
            fatherPhone: true,
            motherName: true,
            motherPhone: true,
          },
        },

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

            assistantAssignments: {
              select: {
                assistant: {
                  select: {
                    id: true,
                    name: true,
                    role: true,
                    isHeadAssistant: true,
                  },
                },
              },
            },
          },
        },

        readStates: {
          where: {
            readerKey: getUserReaderKey(user.id),
          },
          select: {
            lastReadAt: true,
          },
          take: 1,
        },

        messages: {
          orderBy: {
            createdAt: "desc",
          },
          take: 1,
          include: {
            senderUser: {
              select: {
                id: true,
                name: true,
                role: true,
                isHeadAssistant: true,
              },
            },
          },
        },
      },
    });

  const results = [];

  for (const chat of chats) {
    const lastReadAt =
      chat.readStates[0]?.lastReadAt ||
      new Date(0);

    const unreadCount =
      await prisma.studentSupportChatMessage.count({
        where: {
          chatId: chat.id,

          createdAt: {
            gt: lastReadAt,
          },

          OR: [
            {
              senderType: "PARENT",
            },
            {
              senderUserId: {
                not: user.id,
              },
            },
          ],
        },
      });

    results.push({
      id: chat.id,
      type: "STUDENT_SUPPORT_CHAT",

      name: `Student Support - ${chat.student.name}`,

      student: chat.student,
      group: chat.group,

      unreadCount,

      lastReadAt:
        chat.readStates[0]?.lastReadAt ||
        null,

      lastMessage:
        chat.messages[0] || null,
    });
  }

  return results;
}

async function listChatsForParentAccessCode(
  accessCode
) {
  const normalizedCode =
    String(accessCode || "")
      .trim()
      .toUpperCase();

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
        accessCode: true,
        fatherName: true,
        fatherPhone: true,
        motherName: true,
        motherPhone: true,

        studentSupportChatsAsStudent: {
          orderBy: {
            updatedAt: "desc",
          },

          include: {
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

            readStates: {
              where: {
                readerKey: undefined,
              },
              select: {
                lastReadAt: true,
              },
              take: 1,
            },

            messages: {
              orderBy: {
                createdAt: "desc",
              },
              take: 1,
              include: {
                senderUser: {
                  select: {
                    id: true,
                    name: true,
                    role: true,
                    isHeadAssistant: true,
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

  const readerKey =
    getParentReaderKey(student.id);

  const chats =
    await prisma.studentSupportChat.findMany({
      where: {
        studentId: student.id,
      },

      orderBy: {
        updatedAt: "desc",
      },

      include: {
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

        readStates: {
          where: {
            readerKey,
          },
          select: {
            lastReadAt: true,
          },
          take: 1,
        },

        messages: {
          orderBy: {
            createdAt: "desc",
          },
          take: 1,

          include: {
            senderUser: {
              select: {
                id: true,
                name: true,
                role: true,
                isHeadAssistant: true,
              },
            },
          },
        },
      },
    });

  const results = [];

  for (const chat of chats) {
    const lastReadAt =
      chat.readStates[0]?.lastReadAt ||
      new Date(0);

    const unreadCount =
      await prisma.studentSupportChatMessage.count({
        where: {
          chatId: chat.id,
          createdAt: {
            gt: lastReadAt,
          },
          senderType: "USER",
        },
      });

    results.push({
      id: chat.id,
      type: "STUDENT_SUPPORT_CHAT",

      name: `Student Support - ${student.name}`,

      student: {
        id: student.id,
        name: student.name,
        fatherName: student.fatherName,
        fatherPhone: student.fatherPhone,
        motherName: student.motherName,
        motherPhone: student.motherPhone,
      },

      group: chat.group,

      unreadCount,

      lastReadAt:
        chat.readStates[0]?.lastReadAt ||
        null,

      lastMessage:
        chat.messages[0] || null,
    });
  }

  return {
    student: {
      id: student.id,
      name: student.name,
      fatherName: student.fatherName,
      fatherPhone: student.fatherPhone,
      motherName: student.motherName,
      motherPhone: student.motherPhone,
    },

    chats: results,
  };
}

async function getMessagesForUser({
  chatId,
  user,
  before,
  limit = 40,
}) {
  const chat =
    await assertAuthenticatedSupportChatAccess(
      chatId,
      user
    );

  return getMessagesForChat({
    chat,
    before,
    limit,
  });
}

async function getMessagesForParent({
  chatId,
  accessCode,
  before,
  limit = 40,
}) {
  const chat =
    await assertParentSupportChatAccess({
      chatId,
      accessCode,
    });

  return getMessagesForChat({
    chat,
    before,
    limit,
  });
}

async function getMessagesForChat({
  chat,
  before,
  limit = 40,
}) {
  const parsedLimit =
    Math.min(
      Math.max(Number(limit) || 40, 1),
      100
    );

  let beforeDate = null;

  if (before) {
    beforeDate = new Date(before);

    if (
      Number.isNaN(
        beforeDate.getTime()
      )
    ) {
      throw createServiceError(
        400,
        "Invalid pagination date."
      );
    }
  }

  const messages =
    await prisma.studentSupportChatMessage.findMany({
      where: {
        chatId: chat.id,

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
        senderUser: {
          select: {
            id: true,
            name: true,
            role: true,
            isHeadAssistant: true,
          },
        },
      },
    });

  const hasMore =
    messages.length > parsedLimit;

  const page = hasMore
    ? messages.slice(0, parsedLimit)
    : messages;

  return {
    chat: {
      id: chat.id,
      name: `Student Support - ${chat.student.name}`,
      student: chat.student,
      group: chat.group,
      type: "STUDENT_SUPPORT_CHAT",
    },

    messages: page.reverse(),

    hasMore,

    nextBefore:
      hasMore && page.length
        ? page[page.length - 1].createdAt
        : null,
  };
}

async function sendMessageForUser({
  chatId,
  user,
  content,
}) {
  const chat =
    await assertAuthenticatedSupportChatAccess(
      chatId,
      user
    );

  const normalizedContent =
    normalizeText(content);

  if (!normalizedContent) {
    throw createServiceError(
      400,
      "Write a message first."
    );
  }

  const message =
    await prisma.studentSupportChatMessage.create({
      data: {
        chatId: chat.id,
        senderType: "USER",
        senderUserId: user.id,
        messageType: "TEXT",
        content: normalizedContent,
      },

      include: {
        senderUser: {
          select: {
            id: true,
            name: true,
            role: true,
            isHeadAssistant: true,
          },
        },
      },
    });

  await prisma.studentSupportChat.update({
    where: {
      id: chat.id,
    },
    data: {
      updatedAt: new Date(),
    },
  });

  await markReadForUser({
    chatId: chat.id,
    user,
  });

  return message;
}

async function sendMessageForParent({
  chatId,
  accessCode,
  content,
}) {
  const chat =
    await assertParentSupportChatAccess({
      chatId,
      accessCode,
    });

  const normalizedContent =
    normalizeText(content);

  if (!normalizedContent) {
    throw createServiceError(
      400,
      "Write a message first."
    );
  }

  const message =
    await prisma.studentSupportChatMessage.create({
      data: {
        chatId: chat.id,
        senderType: "PARENT",
        parentDisplayName:
          buildParentDisplayName(chat.student),
        messageType: "TEXT",
        content: normalizedContent,
      },

      include: {
        senderUser: {
          select: {
            id: true,
            name: true,
            role: true,
            isHeadAssistant: true,
          },
        },
      },
    });

  await prisma.studentSupportChat.update({
    where: {
      id: chat.id,
    },
    data: {
      updatedAt: new Date(),
    },
  });

  await markReadForParent({
    chatId: chat.id,
    accessCode,
  });

  return message;
}

async function markReadForUser({
  chatId,
  user,
}) {
  const chat =
    await assertAuthenticatedSupportChatAccess(
      chatId,
      user
    );

  const readerKey =
    getUserReaderKey(user.id);

  const lastReadAt =
    new Date();

  await prisma.studentSupportChatReadState.upsert({
    where: {
      chatId_readerKey: {
        chatId: chat.id,
        readerKey,
      },
    },

    update: {
      lastReadAt,
    },

    create: {
      chatId: chat.id,
      readerKey,
      userId: user.id,
      lastReadAt,
    },
  });

  return {
    chatId: chat.id,
    lastReadAt,
  };
}

async function markReadForParent({
  chatId,
  accessCode,
}) {
  const chat =
    await assertParentSupportChatAccess({
      chatId,
      accessCode,
    });

  const readerKey =
    getParentReaderKey(chat.studentId);

  const lastReadAt =
    new Date();

  await prisma.studentSupportChatReadState.upsert({
    where: {
      chatId_readerKey: {
        chatId: chat.id,
        readerKey,
      },
    },

    update: {
      lastReadAt,
    },

    create: {
      chatId: chat.id,
      readerKey,
      userId: null,
      lastReadAt,
    },
  });

  return {
    chatId: chat.id,
    lastReadAt,
  };
}

module.exports = {
  ensureStudentSupportChat,
  listChatsForUser,
  listChatsForParentAccessCode,
  getMessagesForUser,
  getMessagesForParent,
  sendMessageForUser,
  sendMessageForParent,
  markReadForUser,
  markReadForParent,
};