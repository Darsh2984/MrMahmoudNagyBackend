const topicService = require(
  "../services/topic.service"
);

async function createTopic(
  req,
  res
) {
  try {
    const topic =
      await topicService.createTopic({
        name: req.body.name,
        chapterId:
          req.body.chapterId,
      });

    res.json({
      msg: "Topic created",
      topic,
    });
  } catch (err) {
    res
      .status(err.status || 500)
      .json({
        msg:
          err.msg ||
          "Error creating topic",
      });
  }
}

async function listTopics(
  req,
  res
) {
  try {
    const topics =
      await topicService.listTopics({
        chapterId:
          req.query.chapterId,

        unitId:
          req.query.unitId,
      });

    res.json(topics);
  } catch (err) {
    res
      .status(err.status || 500)
      .json({
        msg:
          err.msg ||
          "Error listing topics",
      });
  }
}

async function getTopic(
  req,
  res
) {
  try {
    const topic =
      await topicService
        .getTopicWithResources(
          req.params.topicId
        );

    res.json(topic);
  } catch (err) {
    res
      .status(err.status || 500)
      .json({
        msg:
          err.msg ||
          "Error fetching topic",
      });
  }
}

async function updateTopic(
  req,
  res
) {
  try {
    const topic =
      await topicService.updateTopic(
        req.params.topicId,
        {
          name: req.body.name,
          chapterId:
            req.body.chapterId,
        }
      );

    res.json({
      msg: "Topic updated",
      topic,
    });
  } catch (err) {
    res
      .status(err.status || 500)
      .json({
        msg:
          err.msg ||
          "Error updating topic",
      });
  }
}

async function deleteTopic(
  req,
  res
) {
  try {
    await topicService.deleteTopic(
      req.params.topicId
    );

    res.json({
      msg: "Topic deleted",
    });
  } catch (err) {
    res
      .status(err.status || 500)
      .json({
        msg:
          err.msg ||
          "Error deleting topic",
      });
  }
}

module.exports = {
  createTopic,
  listTopics,
  getTopic,
  updateTopic,
  deleteTopic,
};