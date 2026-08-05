const quizService = require(
  "../services/quiz.service"
);

const {
  resolveTeacherId,
} = require(
  "../utils/resolveTeacher"
);

function parseArray(value, fieldName) {
  if (value === undefined) {
    return undefined;
  }

  if (Array.isArray(value)) {
    return value;
  }

  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);

      if (!Array.isArray(parsed)) {
        throw new Error();
      }

      return parsed;
    } catch {
      const error = new Error(
        `${fieldName} must be a valid array`
      );

      error.status = 400;
      error.msg =
        `${fieldName} must be a valid array`;

      throw error;
    }
  }

  const error = new Error(
    `${fieldName} must be an array`
  );

  error.status = 400;
  error.msg =
    `${fieldName} must be an array`;

  throw error;
}

function sendError(res, error, fallback) {
  console.error(fallback, error);

  return res
    .status(error.status || 500)
    .json({
      msg:
        error.msg ||
        error.message ||
        fallback,
    });
}

async function createQuiz(req, res) {
  try {
    const teacherId =
      await resolveTeacherId(req.user);

    const quiz =
      await quizService.createQuiz({
        teacherId,
        title: req.body.title,
        description:
          req.body.description,
        type: req.body.type,
        durationMinutes:
          req.body.durationMinutes,
        startAt: req.body.startAt,
        endAt: req.body.endAt,

        groupIds:
          parseArray(
            req.body.groupIds,
            "groupIds"
          ) || [],

        questions:
          parseArray(
            req.body.questions,
            "questions"
          ) || [],
      });

    return res.status(201).json({
      msg: "Quiz created",
      quiz,
    });
  } catch (error) {
    return sendError(
      res,
      error,
      "Error creating quiz"
    );
  }
}

async function listQuizzes(req, res) {
  try {
    const teacherId =
      await resolveTeacherId(req.user);

    const quizzes =
      await quizService.listQuizzes(
        teacherId,
        {
          status: req.query.status,
          type: req.query.type,
          groupId: req.query.groupId,
          search: req.query.search,
        }
      );

    return res.json(quizzes);
  } catch (error) {
    return sendError(
      res,
      error,
      "Error listing quizzes"
    );
  }
}

async function getQuiz(req, res) {
  try {
    const teacherId =
      await resolveTeacherId(req.user);

    const quiz =
      await quizService.getQuiz(
        req.params.quizId,
        teacherId
      );

    return res.json(quiz);
  } catch (error) {
    return sendError(
      res,
      error,
      "Error fetching quiz"
    );
  }
}

async function updateQuiz(req, res) {
  try {
    const teacherId =
      await resolveTeacherId(req.user);

    const quiz =
      await quizService.updateQuiz(
        req.params.quizId,
        teacherId,
        {
          title: req.body.title,
          description:
            req.body.description,
          type: req.body.type,

          durationMinutes:
            req.body.durationMinutes,

          startAt: req.body.startAt,
          endAt: req.body.endAt,

          groupIds:
            parseArray(
              req.body.groupIds,
              "groupIds"
            ),

          questions:
            parseArray(
              req.body.questions,
              "questions"
            ),
        }
      );

    return res.json({
      msg: "Quiz updated",
      quiz,
    });
  } catch (error) {
    return sendError(
      res,
      error,
      "Error updating quiz"
    );
  }
}

async function publishQuiz(req, res) {
  try {
    const teacherId =
      await resolveTeacherId(req.user);

    const quiz =
      await quizService.publishQuiz(
        req.params.quizId,
        teacherId
      );

    return res.json({
      msg: "Quiz published",
      quiz,
    });
  } catch (error) {
    return sendError(
      res,
      error,
      "Error publishing quiz"
    );
  }
}

async function closeQuiz(req, res) {
  try {
    const teacherId =
      await resolveTeacherId(req.user);

    const quiz =
      await quizService.closeQuiz(
        req.params.quizId,
        teacherId
      );

    return res.json({
      msg: "Quiz closed",
      quiz,
    });
  } catch (error) {
    return sendError(
      res,
      error,
      "Error closing quiz"
    );
  }
}

async function reopenQuiz(req, res) {
  try {
    const teacherId =
      await resolveTeacherId(req.user);

    const quiz =
      await quizService.reopenQuiz(
        req.params.quizId,
        teacherId
      );

    return res.json({
      msg: "Quiz reopened",
      quiz,
    });
  } catch (error) {
    return sendError(
      res,
      error,
      "Error reopening quiz"
    );
  }
}

async function deleteQuiz(req, res) {
  try {
    const teacherId =
      await resolveTeacherId(req.user);

    await quizService.deleteQuiz(
      req.params.quizId,
      teacherId
    );

    return res.json({
      msg: "Quiz deleted",
    });
  } catch (error) {
    return sendError(
      res,
      error,
      "Error deleting quiz"
    );
  }
}

module.exports = {
  createQuiz,
  listQuizzes,
  getQuiz,
  updateQuiz,
  publishQuiz,
  closeQuiz,
  reopenQuiz,
  deleteQuiz,
};