const chapterService = require(
  "../services/chapter.service"
);

async function createChapter(
  req,
  res
) {
  try {
    const chapter =
      await chapterService.createChapter({
        name: req.body.name,
        unitId: req.body.unitId,
      });

    res.json({
      msg: "Chapter created",
      chapter,
    });
  } catch (err) {
    res
      .status(err.status || 500)
      .json({
        msg:
          err.msg ||
          "Error creating chapter",
      });
  }
}

async function listChapters(
  req,
  res
) {
  try {
    const chapters =
      await chapterService.listChapters({
        unitId: req.query.unitId,
      });

    res.json(chapters);
  } catch (err) {
    res
      .status(err.status || 500)
      .json({
        msg:
          err.msg ||
          "Error listing chapters",
      });
  }
}

async function getChapter(
  req,
  res
) {
  try {
    const chapter =
      await chapterService
        .getChapterWithTopics(
          req.params.chapterId
        );

    res.json(chapter);
  } catch (err) {
    res
      .status(err.status || 500)
      .json({
        msg:
          err.msg ||
          "Error fetching chapter",
      });
  }
}

async function updateChapter(
  req,
  res
) {
  try {
    const chapter =
      await chapterService.updateChapter(
        req.params.chapterId,
        {
          name: req.body.name,
          unitId: req.body.unitId,
        }
      );

    res.json({
      msg: "Chapter updated",
      chapter,
    });
  } catch (err) {
    res
      .status(err.status || 500)
      .json({
        msg:
          err.msg ||
          "Error updating chapter",
      });
  }
}

async function deleteChapter(
  req,
  res
) {
  try {
    await chapterService.deleteChapter(
      req.params.chapterId
    );

    res.json({
      msg: "Chapter deleted",
    });
  } catch (err) {
    res
      .status(err.status || 500)
      .json({
        msg:
          err.msg ||
          "Error deleting chapter",
      });
  }
}

module.exports = {
  createChapter,
  listChapters,
  getChapter,
  updateChapter,
  deleteChapter,
};