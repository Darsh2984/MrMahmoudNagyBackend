const questionService = require(
  "../services/question.service"
);

const {
  resolveTeacherId,
} = require(
  "../utils/resolveTeacher"
);

function parseTopicIds(value) {
  if (value === undefined) {
    return undefined;
  }

  if (Array.isArray(value)) {
    return value;
  }

  if (
    typeof value === "string"
  ) {
    try {
      const parsed =
        JSON.parse(value);

      if (!Array.isArray(parsed)) {
        throw new Error();
      }

      return parsed;
    } catch {
      throw {
        status: 400,
        msg:
          "topicIds must be a valid JSON array",
      };
    }
  }

  throw {
    status: 400,
    msg:
      "topicIds must be an array",
  };
}

function parseBoolean(value) {
  if (
    value === true ||
    value === "true" ||
    value === "1"
  ) {
    return true;
  }

  return false;
}

async function createQuestion(
  req,
  res
) {
  try {
    const teacherId =
      await resolveTeacherId(
        req.user
      );

    const question =
      await questionService.createQuestion({
        title: req.body.title,
        reference:
          req.body.reference,
        type: req.body.type,
        points: req.body.points,
        correctAnswer:
          req.body.correctAnswer,
        teacherId,

        questionFile:
          req.files?.questionFile?.[0],

        markschemeFile:
          req.files
            ?.markschemeFile?.[0],

        chapterId: req.body.chapterId,
      });

    res.json({
      msg: "Question created",
      question,
    });
  } catch (err) {
    res
      .status(err.status || 500)
      .json({
        msg:
          err.msg ||
          "Error creating question",
      });
  }
}

async function listQuestions(
  req,
  res
) {
  try {
    const teacherId =
      await resolveTeacherId(
        req.user
      );

    const questions =
      await questionService
        .listQuestionsForTeacher(
          teacherId,
          {
            type: req.query.type,
            yearId:
              req.query.yearId,
            unitId:
              req.query.unitId,
            chapterId:
              req.query.chapterId,
            search:
              req.query.search,
          }
        );

    res.json(questions);
  } catch (err) {
      console.error(
        "List questions error:",
        err
      );

      res
        .status(err.status || 500)
        .json({
          msg:
            err.msg ||
            err.message ||
            "Error listing questions",
        });
    }
}

async function getQuestion(
  req,
  res
) {
  try {
    const teacherId =
      await resolveTeacherId(
        req.user
      );

    const question =
      await questionService
        .getQuestionForTeacher(
          req.params.questionId,
          teacherId
        );

    res.json(question);
  } catch (err) {
    res
      .status(err.status || 500)
      .json({
        msg:
          err.msg ||
          "Error fetching question",
      });
  }
}

async function updateQuestion(
  req,
  res
) {
  try {
    const teacherId =
      await resolveTeacherId(
        req.user
      );

    const question =
      await questionService
        .updateQuestion(
          req.params.questionId,
          teacherId,
          {
            title:
              req.body.title,
            reference:
              req.body.reference,
            type: req.body.type,
            points:
              req.body.points,
            correctAnswer:
              req.body.correctAnswer,
            chapterId:
              req.body.chapterId,

            removeMarkscheme:
              parseBoolean(
                req.body
                  .removeMarkscheme
              ),

            questionFile:
              req.files
                ?.questionFile?.[0],

            markschemeFile:
              req.files
                ?.markschemeFile?.[0],
          }
        );

    res.json({
      msg: "Question updated",
      question,
    });
  } catch (err) {
    res
      .status(err.status || 500)
      .json({
        msg:
          err.msg ||
          "Error updating question",
      });
  }
}

async function deleteQuestion(
  req,
  res
) {
  try {
    const teacherId =
      await resolveTeacherId(
        req.user
      );

    await questionService
      .deleteQuestion(
        req.params.questionId,
        teacherId
      );

    res.json({
      msg: "Question deleted",
    });
  } catch (err) {
    res
      .status(err.status || 500)
      .json({
        msg:
          err.msg ||
          "Error deleting question",
      });
  }
}

module.exports = {
  createQuestion,
  listQuestions,
  getQuestion,
  updateQuestion,
  deleteQuestion,
};
