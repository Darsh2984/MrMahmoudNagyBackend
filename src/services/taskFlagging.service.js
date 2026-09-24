function getSubmissionFlagStatus(
  grade,
  gradeOutOf,
) {
  const hasGrade =
    grade !== null &&
    grade !== undefined &&
    grade !== "";

  const numericGrade = Number(grade);
  const maximumGrade = Number(gradeOutOf);

  if (
    !hasGrade ||
    !Number.isFinite(numericGrade) ||
    !Number.isFinite(maximumGrade) ||
    maximumGrade <= 0
  ) {
    return {
      gradePercentage: null,
      isFlagged: false,
    };
  }

  const gradePercentage =
    Math.round(
      (numericGrade / maximumGrade) *
        10000,
    ) / 100;

  return {
    gradePercentage,
    isFlagged:
      gradePercentage < 60,
  };
}

module.exports = {
  getSubmissionFlagStatus,
};
