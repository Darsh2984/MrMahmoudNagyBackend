const chapterService = require("../services/chapter.service");

async function createChapter(req, res) {
  try {
    const chapter = await chapterService.createChapter(req.body);
    res.json({ msg: "Chapter created", chapter });
  } catch (err) {
    res.status(err.status || 500).json({ msg: err.msg || "Error creating chapter" });
  }
}

async function getChapter(req, res) {
  try {
    const chapter = await chapterService.getChapterWithTopics(req.params.chapterId);
    res.json(chapter);
  } catch (err) {
    res.status(err.status || 500).json({ msg: err.msg || "Error fetching chapter" });
  }
}

async function updateChapter(req, res) {
  try {
    const chapter = await chapterService.updateChapter(req.params.chapterId, req.body);
    res.json({ msg: "Chapter updated", chapter });
  } catch (err) {
    res.status(err.status || 500).json({ msg: err.msg || "Error updating chapter" });
  }
}

async function deleteChapter(req, res) {
  try {
    await chapterService.deleteChapter(req.params.chapterId);
    res.json({ msg: "Chapter deleted" });
  } catch (err) {
    res.status(err.status || 500).json({ msg: err.msg || "Error deleting chapter" });
  }
}

module.exports = { createChapter, getChapter, updateChapter, deleteChapter };
