const TASK_TYPES = Object.freeze({
  HOMEWORK: "HOMEWORK",
  IN_CLASS_QUIZ: "IN_CLASS_QUIZ",
});

function normalizeTaskType(value, defaultValue) {
  if (value === undefined || value === null || value === "") {
    if (defaultValue) return defaultValue;

    throw {
      status: 400,
      msg: "Task type is required",
    };
  }

  const normalized = String(value).trim().toUpperCase();

  if (!Object.values(TASK_TYPES).includes(normalized)) {
    throw {
      status: 400,
      msg: "Task type must be Homework or In Class Quiz",
    };
  }

  return normalized;
}

module.exports = {
  TASK_TYPES,
  normalizeTaskType,
};
