const prisma = require("../config/prisma");

function normalizeName(name) {
  return typeof name === "string"
    ? name.trim()
    : "";
}

async function assertUnitExists(unitId) {
  if (!unitId) {
    throw {
      status: 400,
      msg: "unitId is required",
    };
  }

  const unit = await prisma.unit.findUnique({
    where: {
      id: unitId,
    },
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
    },
  });

  if (!unit) {
    throw {
      status: 404,
      msg: "Unit not found",
    };
  }

  return unit;
}

async function assertChapterExists(chapterId) {
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
            yearId: true,
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

  if (!chapter) {
    throw {
      status: 404,
      msg: "Chapter not found",
    };
  }

  return chapter;
}

async function assertNoDuplicateChapter({
  name,
  unitId,
  excludeChapterId = null,
}) {
  const duplicate =
    await prisma.chapter.findFirst({
      where: {
        unitId,

        ...(excludeChapterId
          ? {
              id: {
                not: excludeChapterId,
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
        "A chapter with this name already exists in this unit",
    };
  }
}

async function createChapter({
  name,
  unitId,
}) {
  const normalizedName =
    normalizeName(name);

  if (!normalizedName) {
    throw {
      status: 400,
      msg: "Chapter name is required",
    };
  }

  await assertUnitExists(unitId);

  await assertNoDuplicateChapter({
    name: normalizedName,
    unitId,
  });

  return prisma.chapter.create({
    data: {
      name: normalizedName,
      unitId,
    },

    include: {
      unit: {
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
        },
      },

      _count: {
        select: {
          materials: true,
          videos: true,
        },
      },
    },
  });
}

async function listChapters({
  unitId,
} = {}) {
  if (unitId) {
    await assertUnitExists(unitId);
  }

  return prisma.chapter.findMany({
    where: {
      ...(unitId
        ? {
            unitId,
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
      unit: {
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
        },
      },

      _count: {
        select: {
          materials: true,
          videos: true,
        },
      },
    },
  });
}

async function getChapterWithResources(chapterId) {
  const chapter =
    await prisma.chapter.findUnique({
      where: {
        id: chapterId,
      },

      include: {
        unit: {
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

async function updateChapter(
  chapterId,
  { name, unitId }
) {
  const existingChapter =
    await assertChapterExists(
      chapterId
    );

  const normalizedName =
    name === undefined
      ? existingChapter.name
      : normalizeName(name);

  if (!normalizedName) {
    throw {
      status: 400,
      msg: "Chapter name is required",
    };
  }

  const targetUnitId =
    unitId || existingChapter.unitId;

  await assertUnitExists(targetUnitId);

  await assertNoDuplicateChapter({
    name: normalizedName,
    unitId: targetUnitId,
    excludeChapterId: chapterId,
  });

  return prisma.chapter.update({
    where: {
      id: chapterId,
    },

    data: {
      name: normalizedName,
      unitId: targetUnitId,
    },

    include: {
      unit: {
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
        },
      },

      _count: {
        select: {
          materials: true,
          videos: true,
        },
      },
    },
  });
}

async function deleteChapter(chapterId) {
  await assertChapterExists(chapterId);

  const [
    materialCount,
    videoCount,
  ] = await Promise.all([
    prisma.material.count({
      where: {
        chapterId,
      },
    }),

    prisma.video.count({
      where: {
        chapterId,
      },
    }),
  ]);

  if (
    materialCount > 0 ||
    videoCount > 0
  ) {
    throw {
      status: 400,
      msg:
        "Cannot delete a chapter that still contains materials or videos",
    };
  }

  return prisma.chapter.delete({
    where: {
      id: chapterId,
    },
  });
}

module.exports = {
  createChapter,
  listChapters,
  getChapterWithResources,
  updateChapter,
  deleteChapter,
};