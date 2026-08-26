const prisma = require("../config/prisma");

function normalizeName(name) {
  return typeof name === "string"
    ? name.trim()
    : "";
}

async function assertYearExists(yearId) {
  if (!yearId) {
    throw {
      status: 400,
      msg: "yearId is required",
    };
  }

  const year =
    await prisma.year.findUnique({
      where: {
        id: yearId,
      },
      select: {
        id: true,
        name: true,
      },
    });

  if (!year) {
    throw {
      status: 404,
      msg: "Academic year not found",
    };
  }

  return year;
}

async function assertUnitExists(unitId) {
  const unit =
    await prisma.unit.findUnique({
      where: {
        id: unitId,
      },
      select: {
        id: true,
        name: true,
        yearId: true,
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

async function assertNoDuplicateUnit({
  name,
  yearId,
  excludeUnitId = null,
}) {
  const duplicate =
    await prisma.unit.findFirst({
      where: {
        yearId,

        ...(excludeUnitId
          ? {
              id: {
                not: excludeUnitId,
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
        "A unit with this name already exists in this academic year",
    };
  }
}

async function createUnit({
  name,
  yearId,
  teacherId,
}) {
  const normalizedName =
    normalizeName(name);

  if (!normalizedName) {
    throw {
      status: 400,
      msg: "Unit name is required",
    };
  }

  if (!teacherId) {
    throw {
      status: 401,
      msg: "Unauthorized",
    };
  }

  await assertYearExists(yearId);

  await assertNoDuplicateUnit({
    name: normalizedName,
    yearId,
  });

  return prisma.unit.create({
    data: {
      name: normalizedName,
      yearId,
      teacherId,
    },
    include: {
      year: {
        select: {
          id: true,
          name: true,
        },
      },
      _count: {
        select: {
          chapters: true,
          materials: true,
          videos: true,
        },
      },
    },
  });
}

async function listUnits({
  yearId,
} = {}) {
  if (yearId) {
    return listUnitsByYear(yearId);
  }

  /*
   * Kept for temporary backward compatibility.
   * New teacher/student content pages should use
   * /units/year/:yearId.
   */
  return prisma.unit.findMany({
    orderBy: [
      {
        year: {
          name: "asc",
        },
      },
      {
        name: "asc",
      },
      {
        createdAt: "asc",
      },
    ],
    include: {
      year: {
        select: {
          id: true,
          name: true,
        },
      },
      _count: {
        select: {
          chapters: true,
          materials: true,
          videos: true,
        },
      },
    },
  });
}

async function listUnitsByYear(yearId) {
  await assertYearExists(yearId);

  return prisma.unit.findMany({
    where: {
      yearId,
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
      year: {
        select: {
          id: true,
          name: true,
        },
      },
      _count: {
        select: {
          chapters: true,
          materials: true,
          videos: true,
        },
      },
    },
  });
}

async function getUnitWithChapters(unitId) {
  const unit =
    await prisma.unit.findUnique({
      where: {
        id: unitId,
      },
      include: {
        year: {
          select: {
            id: true,
            name: true,
          },
        },
        chapters: {
          orderBy: [
            {
              name: "asc",
            },
            {
              createdAt: "asc",
            },
          ],
          include: {
            _count: {
              select: {
                materials: true,
                videos: true,
              },
            },
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

async function updateUnit(
  unitId,
  { name, yearId }
) {
  const existingUnit =
    await assertUnitExists(unitId);

  const normalizedName =
    name === undefined
      ? existingUnit.name
      : normalizeName(name);

  if (!normalizedName) {
    throw {
      status: 400,
      msg: "Unit name is required",
    };
  }

  const targetYearId =
    yearId || existingUnit.yearId;

  await assertYearExists(targetYearId);

  await assertNoDuplicateUnit({
    name: normalizedName,
    yearId: targetYearId,
    excludeUnitId: unitId,
  });

  return prisma.unit.update({
    where: {
      id: unitId,
    },
    data: {
      name: normalizedName,
      yearId: targetYearId,
    },
    include: {
      year: {
        select: {
          id: true,
          name: true,
        },
      },
      _count: {
        select: {
          chapters: true,
          materials: true,
          videos: true,
        },
      },
    },
  });
}

async function deleteUnit(unitId) {
  await assertUnitExists(unitId);

  const [
    chapterCount,
    materialCount,
    videoCount,
  ] = await Promise.all([
    prisma.chapter.count({
      where: {
        unitId,
      },
    }),

    prisma.material.count({
      where: {
        unitId,
      },
    }),

    prisma.video.count({
      where: {
        unitId,
      },
    }),
  ]);

  if (
    chapterCount > 0 ||
    materialCount > 0 ||
    videoCount > 0
  ) {
    throw {
      status: 400,
      msg:
        "Cannot delete a unit that still contains chapters, materials, or videos",
    };
  }

  return prisma.unit.delete({
    where: {
      id: unitId,
    },
  });
}

module.exports = {
  createUnit,
  listUnits,
  listUnitsByYear,
  getUnitWithChapters,
  updateUnit,
  deleteUnit,
};