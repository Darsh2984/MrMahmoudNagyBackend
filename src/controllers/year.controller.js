const yearService = require("../services/year.service");
const { resolveTeacherId } = require("../utils/resolveTeacher");

async function listMyYears(req, res) {
  try {
    const teacherId = await resolveTeacherId(req.user);
    const years = await yearService.listYearsForTeacher(teacherId);
    res.json(years);
  } catch (err) {
    res.status(err.status || 500).json({ msg: err.msg || "Error listing years" });
  }
}

async function listYearsForTeacher(
  teacherId,
  viewer
) {
  if (!viewer) {
    throw createHttpError(401, "Unauthorized");
  }

  const isRegularAssistant =
    viewer.role === "ASSISTANT" &&
    !viewer.isHeadAssistant;

  const isStudent = viewer.role === "STUDENT";

  return prisma.year.findMany({
    where: {
      teacherId,

      ...(isRegularAssistant
        ? {
            groups: {
              some: {
                assistantAssignments: {
                  some: {
                    assistantId: viewer.id,
                  },
                },
              },
            },
          }
        : {}),

      ...(isStudent
        ? {
            groups: {
              some: {
                members: {
                  some: {
                    studentId: viewer.id,
                  },
                },
              },
            },
          }
        : {}),
    },

    orderBy: {
      createdAt: "asc",
    },
  });
}

async function createYear(req, res) {
  try {
    const teacherId = await resolveTeacherId(req.user);

    const year = await yearService.createYear({
      name: req.body.name,
      teacherId,
    });

    res.json({ msg: "Year created", year });
  } catch (err) {
    res
      .status(err.status || 500)
      .json({ msg: err.msg || "Error creating year" });
  }
}

async function listMyYears(req, res) {
  try {
    const teacherId = await resolveTeacherId(req.user);

    const years = await yearService.listYearsForTeacher(
      teacherId,
      req.user
    );

    res.json(years);
  } catch (err) {
    res
      .status(err.status || 500)
      .json({ msg: err.msg || "Error listing years" });
  }
}

async function getYear(yearId, viewer) {
  await assertYearAccess(yearId, viewer);

  const isRegularAssistant =
    viewer.role === "ASSISTANT" &&
    !viewer.isHeadAssistant;

  const isStudent = viewer.role === "STUDENT";

  const year = await prisma.year.findUnique({
    where: {
      id: yearId,
    },

    include: {
      groups: {
        where: {
          ...(isRegularAssistant
            ? {
                assistantAssignments: {
                  some: {
                    assistantId: viewer.id,
                  },
                },
              }
            : {}),

          ...(isStudent
            ? {
                members: {
                  some: {
                    studentId: viewer.id,
                  },
                },
              }
            : {}),
        },
      },

      units: {
        select: {
          id: true,
          name: true,
        },
      },
    },
  });

  if (!year) {
    throw createHttpError(404, "Year not found");
  }

  return year;
}

async function updateYear(req, res) {
  try {
    const year = await yearService.updateYear(req.params.yearId, req.body);
    res.json({ msg: "Year updated", year });
  } catch (err) {
    res.status(err.status || 500).json({ msg: err.msg || "Error updating year" });
  }
}

async function deleteYear(req, res) {
  try {
    await yearService.deleteYear(req.params.yearId);
    res.json({ msg: "Year deleted" });
  } catch (err) {
    res.status(err.status || 500).json({ msg: err.msg || "Error deleting year" });
  }
}

async function updateZoomLinks(req, res) {
  try {
    const year = await yearService.updateZoomLinks(req.params.yearId, req.body.zoomLinks);
    res.json({ msg: "Zoom links updated", year });
  } catch (err) {
    res.status(err.status || 500).json({ msg: err.msg || "Error updating zoom links" });
  }
}

async function getZoomLinks(yearId, viewer) {
  await assertYearAccess(yearId, viewer);

  const year = await prisma.year.findUnique({
    where: {
      id: yearId,
    },
    select: {
      zoomLinks: true,
    },
  });

  if (!year) {
    throw createHttpError(404, "Year not found");
  }

  return year.zoomLinks || [];
}

module.exports = { createYear, listYearsForTeacher, listMyYears, getYear, updateYear, deleteYear, updateZoomLinks, getZoomLinks };
