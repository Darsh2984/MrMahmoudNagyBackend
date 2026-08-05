const prisma = require("../config/prisma");
const storage = require("./storage.service");

const QUESTION_TYPES = ["MCQ", "WRITTEN"];
const MCQ_ANSWERS = ["A", "B", "C", "D"];

function normalizeText(value) {
  return typeof value === "string"
    ? value.trim()
    : "";
}

function normalizeOptionalText(value) {
  const normalized = normalizeText(value);

  return normalized || null;
}

function normalizeQuestionType(type) {
  const normalizedType =
    normalizeText(type).toUpperCase();

  if (
    !QUESTION_TYPES.includes(
      normalizedType
    )
  ) {
    throw {
      status: 400,
      msg:
        "Question type must be MCQ or WRITTEN",
    };
  }

  return normalizedType;
}

function normalizeCorrectAnswer(
  type,
  correctAnswer
) {
  const normalizedAnswer =
    normalizeText(
      correctAnswer
    ).toUpperCase();

  if (type === "MCQ") {
    if (
      !MCQ_ANSWERS.includes(
        normalizedAnswer
      )
    ) {
      throw {
        status: 400,
        msg:
          "MCQ questions require correctAnswer to be A, B, C, or D",
      };
    }

    return normalizedAnswer;
  }

  if (normalizedAnswer) {
    throw {
      status: 400,
      msg:
        "Written questions cannot have a correctAnswer",
    };
  }

  return null;
}

function normalizePoints(points) {
  const numericPoints = Number(points);

  if (
    !Number.isFinite(numericPoints) ||
    numericPoints <= 0
  ) {
    throw {
      status: 400,
      msg:
        "Question points must be greater than zero",
    };
  }

  return numericPoints;
}

function normalizeTopicIds(topicIds) {
  if (!Array.isArray(topicIds)) {
    throw {
      status: 400,
      msg:
        "topicIds must be an array",
    };
  }

  const normalizedIds = [
    ...new Set(
      topicIds
        .map((topicId) =>
          normalizeText(topicId)
        )
        .filter(Boolean)
    ),
  ];

  if (!normalizedIds.length) {
    throw {
      status: 400,
      msg:
        "At least one topicId is required",
    };
  }

  return normalizedIds;
}

async function assertTopicsExist(
  topicIds
) {
  const topics =
    await prisma.topic.findMany({
      where: {
        id: {
          in: topicIds,
        },
      },

      select: {
        id: true,
      },
    });

  if (
    topics.length !== topicIds.length
  ) {
    throw {
      status: 400,
      msg:
        "One or more selected topics do not exist",
    };
  }
}

async function assertQuestionExists(
  questionId,
  teacherId
) {
  const question =
    await prisma.question.findFirst({
      where: {
        id: questionId,
        teacherId,
      },

      include: {
        topics: {
          include: {
            topic: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        },

        _count: {
          select: {
            quizzes: true,
            checkpoints: true,
          },
        },
      },
    });

  if (!question) {
    throw {
      status: 404,
      msg: "Question not found",
    };
  }

  return question;
}

async function addSignedFileUrls(
  question
) {
  const [
    questionFileUrl,
    markschemeFileUrl,
  ] = await Promise.all([
    storage.getSignedUrl(
      question.questionFileUrl,
      15
    ),

    question.markschemeFileUrl
      ? storage.getSignedUrl(
          question.markschemeFileUrl,
          15
        )
      : Promise.resolve(null),
  ]);

  return {
    ...question,

    questionFileKey:
      question.questionFileUrl,

    markschemeFileKey:
      question.markschemeFileUrl,

    questionFileUrl,
    markschemeFileUrl,
  };
}

async function createQuestion({
  title,
  reference,
  type,
  points,
  correctAnswer,
  teacherId,
  questionFile,
  markschemeFile,
  topicIds,
}) {
  const normalizedTitle =
    normalizeText(title);

  if (!normalizedTitle) {
    throw {
      status: 400,
      msg:
        "Question title is required",
    };
  }

  if (!teacherId) {
    throw {
      status: 401,
      msg: "Unauthorized",
    };
  }

  if (!questionFile) {
    throw {
      status: 400,
      msg:
        "A question PDF or image is required",
    };
  }

  const normalizedType =
    normalizeQuestionType(type);

  const normalizedAnswer =
    normalizeCorrectAnswer(
      normalizedType,
      correctAnswer
    );

  const normalizedPoints =
    normalizePoints(points);

  const normalizedTopicIds =
    normalizeTopicIds(topicIds);

  await assertTopicsExist(
    normalizedTopicIds
  );

  let questionFileKey = null;
  let markschemeFileKey = null;

  try {
    questionFileKey =
      await storage.uploadBuffer(
        questionFile.buffer,
        questionFile.originalname,
        questionFile.mimetype,
        "questions"
      );

    if (markschemeFile) {
      markschemeFileKey =
        await storage.uploadBuffer(
          markschemeFile.buffer,
          markschemeFile.originalname,
          markschemeFile.mimetype,
          "markschemes"
        );
    }

    const question =
      await prisma.question.create({
        data: {
          title: normalizedTitle,

          reference:
            normalizeOptionalText(
              reference
            ),

          type: normalizedType,
          points: normalizedPoints,

          correctAnswer:
            normalizedAnswer,

          questionFileUrl:
            questionFileKey,

          markschemeFileUrl:
            normalizedType ===
              "WRITTEN"
              ? markschemeFileKey
              : null,

          teacherId,

          topics: {
            create:
              normalizedTopicIds.map(
                (topicId) => ({
                  topicId,
                })
              ),
          },
        },

        include: {
          topics: {
            include: {
              topic: {
                include: {
                  chapter: {
                    include: {
                      unit: {
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
          },
        },
      });

    return addSignedFileUrls(
      question
    );
  } catch (error) {
    await Promise.all([
      questionFileKey
        ? storage.deleteFile(
            questionFileKey
          )
        : Promise.resolve(),

      markschemeFileKey
        ? storage.deleteFile(
            markschemeFileKey
          )
        : Promise.resolve(),
    ]);

    throw error;
  }
}

async function listQuestionsForTeacher(
  teacherId,
  {
    type,
    unitId,
    chapterId,
    topicId,
    search,
  } = {}
) {
  if (!teacherId) {
    throw {
      status: 401,
      msg: "Unauthorized",
    };
  }

  const normalizedType = type
    ? normalizeQuestionType(type)
    : null;

  const normalizedSearch =
    normalizeText(search);

  const questions =
    await prisma.question.findMany({
      where: {
        teacherId,

        ...(normalizedType
          ? {
              type: normalizedType,
            }
          : {}),

        ...(topicId
          ? {
              topics: {
                some: {
                  topicId,
                },
              },
            }
          : {}),

        ...(chapterId
          ? {
              topics: {
                some: {
                  topic: {
                    chapterId,
                  },
                },
              },
            }
          : {}),

        ...(unitId
          ? {
              topics: {
                some: {
                  topic: {
                    chapter: {
                      unitId,
                    },
                  },
                },
              },
            }
          : {}),

        ...(normalizedSearch
          ? {
              OR: [
                {
                  title: {
                    contains:
                      normalizedSearch,
                    mode: "insensitive",
                  },
                },

                {
                  reference: {
                    contains:
                      normalizedSearch,
                    mode: "insensitive",
                  },
                },

                {
                  topics: {
                    some: {
                      topic: {
                        name: {
                          contains:
                            normalizedSearch,
                          mode:
                            "insensitive",
                        },
                      },
                    },
                  },
                },
              ],
            }
          : {}),
      },

      include: {
        topics: {
          include: {
            topic: {
              include: {
                chapter: {
                  include: {
                    unit: {
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
        },

        _count: {
          select: {
            quizzes: true,
            checkpoints: true,
          },
        },
      },

      orderBy: {
        createdAt: "desc",
      },
    });

  return Promise.all(
    questions.map(
      addSignedFileUrls
    )
  );
}

async function getQuestionForTeacher(
  questionId,
  teacherId
) {
  const question =
    await assertQuestionExists(
      questionId,
      teacherId
    );

  const detailedQuestion =
    await prisma.question.findUnique({
      where: {
        id: question.id,
      },

      include: {
        topics: {
          include: {
            topic: {
              include: {
                chapter: {
                  include: {
                    unit: {
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
        },

        _count: {
          select: {
            quizzes: true,
            checkpoints: true,
          },
        },
      },
    });

  return addSignedFileUrls(
    detailedQuestion
  );
}

async function updateQuestion(
  questionId,
  teacherId,
  {
    title,
    reference,
    type,
    points,
    correctAnswer,
    topicIds,
    removeMarkscheme = false,
    questionFile,
    markschemeFile,
  }
) {
  const existingQuestion =
    await assertQuestionExists(
      questionId,
      teacherId
    );

  const normalizedTitle =
    title === undefined
      ? existingQuestion.title
      : normalizeText(title);

  if (!normalizedTitle) {
    throw {
      status: 400,
      msg:
        "Question title is required",
    };
  }

  const normalizedType =
    type === undefined
      ? existingQuestion.type
      : normalizeQuestionType(type);

  const normalizedPoints =
    points === undefined
      ? existingQuestion.points
      : normalizePoints(points);

  let answerInput = correctAnswer;

  if (
    correctAnswer === undefined &&
    normalizedType ===
      existingQuestion.type
  ) {
    answerInput =
      existingQuestion.correctAnswer;
  }

  const normalizedAnswer =
    normalizeCorrectAnswer(
      normalizedType,
      answerInput
    );

  let normalizedTopicIds = null;

  if (topicIds !== undefined) {
    normalizedTopicIds =
      normalizeTopicIds(topicIds);

    await assertTopicsExist(
      normalizedTopicIds
    );
  }

  let newQuestionFileKey = null;
  let newMarkschemeFileKey = null;

  try {
    if (questionFile) {
      newQuestionFileKey =
        await storage.uploadBuffer(
          questionFile.buffer,
          questionFile.originalname,
          questionFile.mimetype,
          "questions"
        );
    }

    if (markschemeFile) {
      newMarkschemeFileKey =
        await storage.uploadBuffer(
          markschemeFile.buffer,
          markschemeFile.originalname,
          markschemeFile.mimetype,
          "markschemes"
        );
    }

    let targetMarkschemeKey =
      existingQuestion
        .markschemeFileUrl;

    if (
      normalizedType === "MCQ" ||
      removeMarkscheme
    ) {
      targetMarkschemeKey = null;
    }

    if (
      normalizedType === "WRITTEN" &&
      newMarkschemeFileKey
    ) {
      targetMarkschemeKey =
        newMarkschemeFileKey;
    }

    const question =
      await prisma.$transaction(
        async (tx) => {
          if (normalizedTopicIds) {
            await tx.questionTopic.deleteMany({
              where: {
                questionId,
              },
            });
          }

          return tx.question.update({
            where: {
              id: questionId,
            },

            data: {
              title: normalizedTitle,

              reference:
                reference === undefined
                  ? existingQuestion.reference
                  : normalizeOptionalText(
                      reference
                    ),

              type: normalizedType,
              points: normalizedPoints,

              correctAnswer:
                normalizedAnswer,

              questionFileUrl:
                newQuestionFileKey ||
                existingQuestion
                  .questionFileUrl,

              markschemeFileUrl:
                targetMarkschemeKey,

              ...(normalizedTopicIds
                ? {
                    topics: {
                      create:
                        normalizedTopicIds.map(
                          (topicId) => ({
                            topicId,
                          })
                        ),
                    },
                  }
                : {}),
            },

            include: {
              topics: {
                include: {
                  topic: {
                    include: {
                      chapter: {
                        include: {
                          unit: {
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
              },

              _count: {
                select: {
                  quizzes: true,
                  checkpoints: true,
                },
              },
            },
          });
        }
      );

    const oldFilesToDelete = [];

    if (
      newQuestionFileKey &&
      existingQuestion
        .questionFileUrl
    ) {
      oldFilesToDelete.push(
        existingQuestion
          .questionFileUrl
      );
    }

    const markschemeWasReplaced =
      newMarkschemeFileKey &&
      existingQuestion
        .markschemeFileUrl;

    const markschemeWasRemoved =
      existingQuestion
        .markschemeFileUrl &&
      !question.markschemeFileUrl;

    if (
      markschemeWasReplaced ||
      markschemeWasRemoved
    ) {
      oldFilesToDelete.push(
        existingQuestion
          .markschemeFileUrl
      );
    }

    await Promise.all(
      oldFilesToDelete.map(
        storage.deleteFile
      )
    );

    return addSignedFileUrls(
      question
    );
  } catch (error) {
    await Promise.all([
      newQuestionFileKey
        ? storage.deleteFile(
            newQuestionFileKey
          )
        : Promise.resolve(),

      newMarkschemeFileKey
        ? storage.deleteFile(
            newMarkschemeFileKey
          )
        : Promise.resolve(),
    ]);

    throw error;
  }
}

async function deleteQuestion(
  questionId,
  teacherId
) {
  const question =
    await assertQuestionExists(
      questionId,
      teacherId
    );

  if (
    question._count.quizzes > 0
  ) {
    throw {
      status: 400,
      msg:
        "Cannot delete a question that is used in a quiz",
    };
  }

  if (
    question._count.checkpoints > 0
  ) {
    throw {
      status: 400,
      msg:
        "Cannot delete a question that is used by a video checkpoint",
    };
  }

  await prisma.$transaction(
    async (tx) => {
      await tx.questionTopic.deleteMany({
        where: {
          questionId,
        },
      });

      await tx.question.delete({
        where: {
          id: questionId,
        },
      });
    }
  );

  await Promise.all([
    storage.deleteFile(
      question.questionFileUrl
    ),

    question.markschemeFileUrl
      ? storage.deleteFile(
          question.markschemeFileUrl
        )
      : Promise.resolve(),
  ]);
}

module.exports = {
  createQuestion,
  listQuestionsForTeacher,
  getQuestionForTeacher,
  updateQuestion,
  deleteQuestion,
};