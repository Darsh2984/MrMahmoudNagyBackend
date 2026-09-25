function evaluateAssistantAssignments(assignments) {
  const assignedAssistants = (Array.isArray(assignments) ? assignments : [])
    .map(({ assistant }) => assistant)
    .filter((assistant) => assistant?.role === "ASSISTANT");

  if (assignedAssistants.length !== 1) {
    return {
      assistant: null,
      reason:
        assignedAssistants.length === 0
          ? "NO_ASSISTANT"
          : "MULTIPLE_ASSISTANTS",
    };
  }

  const assistant = assignedAssistants[0];
  const canGrade =
    assistant.isHeadAssistant === true ||
    assistant.permissions?.canGradeHomework === true;

  if (!canGrade) {
    return {
      assistant: null,
      reason: "ASSISTANT_CANNOT_GRADE_HOMEWORK",
    };
  }

  return {
    assistant,
    reason: null,
  };
}

module.exports = { evaluateAssistantAssignments };
