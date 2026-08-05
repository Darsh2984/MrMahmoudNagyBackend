const prisma = require("../config/prisma");

function normalizeName(name) {
  return typeof name === "string"
    ? name.trim()
    : "";
}

async function assertChapterExists(chapterId) {
  if (!chapterId) {
    throw {
      status: 400,
      msg: "chapterId is required",
    };
  }

  const chapter =
    await prisma.chapter.findUnique({
      where: {
        id: chapterId,
      },

      select: {
        id: true,
        name: true,
        unitId: true,

        unit: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

  if (!chapter) {
    throw {
      status: 404,
      msg: "Chapter not found",
    };
  }

  return chapter;
}

async function assertTopicExists(topicId) {
  const topic =
    await prisma.topic.findUnique({
      where: {
        id: topicId,
      },

      select: {
        id: true,
        name: true,
        chapterId: true,
      },
    });

  if (!topic) {
    throw {
      status: 404,
      msg: "Topic not found",
    };
  }

  return topic;
}

async function assertNoDuplicateTopic({
  name,
  chapterId,
  excludeTopicId = null,
}) {
  const duplicate =
    await prisma.topic.findFirst({
      where: {
        chapterId,

        ...(excludeTopicId
          ? {
              id: {
                not: excludeTopicId,
              },
            }
          : {}),

        name: {
          equals: name,
          mode: "insensitive",
        },
      },

      select: {
        id: true,
      },
    });

  if (duplicate) {
    throw {
      status: 400,
      msg:
        "A topic with this name already exists in this chapter",
    };
  }
}

async function createTopic({
  name,
  chapterId,
}) {
  const normalizedName =
    normalizeName(name);

  if (!normalizedName) {
    throw {
      status: 400,
      msg: "Topic name is required",
    };
  }

  await assertChapterExists(chapterId);

  await assertNoDuplicateTopic({
    name: normalizedName,
    chapterId,
  });

  return prisma.topic.create({
    data: {
      name: normalizedName,
      chapterId,
    },

    include: {
      chapter: {
        select: {
          id: true,
          name: true,

          unit: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      },

      _count: {
        select: {
          materials: true,
          videos: true,
          questionTags: true,
        },
      },
    },
  });
}

async function listTopics({
  chapterId,
  unitId,
} = {}) {
  if (chapterId) {
    await assertChapterExists(chapterId);
  }

  if (unitId) {
    const unit =
      await prisma.unit.findUnique({
        where: {
          id: unitId,
        },

        select: {
          id: true,
        },
      });

    if (!unit) {
      throw {
        status: 404,
        msg: "Unit not found",
      };
    }
  }

  return prisma.topic.findMany({
    where: {
      ...(chapterId
        ? {
            chapterId,
          }
        : {}),

      ...(unitId
        ? {
            chapter: {
              unitId,
            },
          }
        : {}),
    },

    orderBy: [
      {
        name: "asc",
      },
      {
        createdAt: "asc",
      },
    ],

    include: {
      chapter: {
        select: {
          id: true,
          name: true,

          unit: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      },

      _count: {
        select: {
          materials: true,
          videos: true,
          questionTags: true,
        },
      },
    },
  });
}

async function getTopicWithResources(
  topicId
) {
  const topic =
    await prisma.topic.findUnique({
      where: {
        id: topicId,
      },

      include: {
        chapter: {
          select: {
            id: true,
            name: true,

            unit: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        },

        materials: {
          orderBy: {
            createdAt: "asc",
          },
        },

        videos: {
          orderBy: {
            createdAt: "asc",
          },

          include: {
            checkpoints: true,
          },
        },

        _count: {
          select: {
            materials: true,
            videos: true,
            questionTags: true,
          },
        },
      },
    });

  if (!topic) {
    throw {
      status: 404,
      msg: "Topic not found",
    };
  }

  return topic;
}

async function updateTopic(
  topicId,
  { name, chapterId }
) {
  const existingTopic =
    await assertTopicExists(topicId);

  const normalizedName =
    name === undefined
      ? existingTopic.name
      : normalizeName(name);

  if (!normalizedName) {
    throw {
      status: 400,
      msg: "Topic name is required",
    };
  }

  const targetChapterId =
    chapterId ||
    existingTopic.chapterId;

  await assertChapterExists(
    targetChapterId
  );

  await assertNoDuplicateTopic({
    name: normalizedName,
    chapterId: targetChapterId,
    excludeTopicId: topicId,
  });

  return prisma.topic.update({
    where: {
      id: topicId,
    },

    data: {
      name: normalizedName,
      chapterId: targetChapterId,
    },

    include: {
      chapter: {
        select: {
          id: true,
          name: true,

          unit: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      },

      _count: {
        select: {
          materials: true,
          videos: true,
          questionTags: true,
        },
      },
    },
  });
}

async function deleteTopic(topicId) {
  await assertTopicExists(topicId);

  const [
    resourceCount,
    videoCount,
    questionCount,
  ] = await Promise.all([
    prisma.material.count({
      where: {
        topicId,
      },
    }),

    prisma.video.count({
      where: {
        topicId,
      },
    }),

    prisma.questionTopic.count({
      where: {
        topicId,
      },
    }),
  ]);

  if (
    resourceCount > 0 ||
    videoCount > 0 ||
    questionCount > 0
  ) {
    throw {
      status: 400,
      msg:
        "Cannot delete a topic that still contains materials, videos, or linked questions",
    };
  }

  return prisma.topic.delete({
    where: {
      id: topicId,
    },
  });
}

module.exports = {
  createTopic,
  listTopics,
  getTopicWithResources,
  updateTopic,
  deleteTopic,
};