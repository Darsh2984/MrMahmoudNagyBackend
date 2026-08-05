const prisma = require("../config/prisma");

function normalizeName(name) {
  return typeof name === "string"
    ? name.trim()
    : "";
}

async function createUnit({
  name,
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

  const existing =
    await prisma.unit.findFirst({
      where: {
        name: {
          equals: normalizedName,
          mode: "insensitive",
        },
      },
      select: {
        id: true,
      },
    });

  if (existing) {
    throw {
      status: 400,
      msg: "A unit with this name already exists",
    };
  }

  return prisma.unit.create({
    data: {
      name: normalizedName,
      teacherId,
    },
    include: {
      _count: {
        select: {
          chapters: true,
        },
      },
    },
  });
}

async function listUnits() {
  return prisma.unit.findMany({
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
          chapters: true,
          materials: true,
          videos: true,
        },
      },
    },
  });
}

async function getUnitWithChapters(
  unitId
) {
  const unit =
    await prisma.unit.findUnique({
      where: {
        id: unitId,
      },
      include: {
        chapters: {
          orderBy: {
            createdAt: "asc",
          },
          include: {
            _count: {
              select: {
                topics: true,
                materials: true,
                videos: true,
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
  { name }
) {
  const normalizedName =
    normalizeName(name);

  if (!normalizedName) {
    throw {
      status: 400,
      msg: "Unit name is required",
    };
  }

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

  const duplicate =
    await prisma.unit.findFirst({
      where: {
        id: {
          not: unitId,
        },
        name: {
          equals: normalizedName,
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
      msg: "A unit with this name already exists",
    };
  }

  return prisma.unit.update({
    where: {
      id: unitId,
    },
    data: {
      name: normalizedName,
    },
    include: {
      _count: {
        select: {
          chapters: true,
        },
      },
    },
  });
}

async function deleteUnit(unitId) {
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
  getUnitWithChapters,
  updateUnit,
  deleteUnit,
};