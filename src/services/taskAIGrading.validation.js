const stringArray = { type: "array", items: { type: "string" } };
const rubricSchema = {
  type: "object",
  properties: {
    documentWarnings: stringArray,
    questions: {
      type: "array",
      items: {
        type: "object",
        properties: {
          question: { type: "string" },
          questionText: { type: "string" },
          possible: { type: "number" },
          markingPoints: stringArray,
          acceptedAnswers: stringArray,
          commonErrors: stringArray,
          references: { type: "string" },
          uncertainties: stringArray,
        },
        required: ["question", "questionText", "possible", "markingPoints", "acceptedAnswers", "commonErrors", "references", "uncertainties"],
      },
    },
  },
  required: ["questions", "documentWarnings"],
};
const correctionSchema = {
  type: "object",
  properties: {
    summary: { type: "string" },
    overallFeedback: { type: "string" },
    strengths: stringArray,
    weaknesses: stringArray,
    teacherNotes: { type: "string" },
    questionBreakdown: {
      type: "array",
      items: {
        type: "object",
        properties: {
          question: { type: "string" },
          awarded: { type: "number" },
          studentAnswer: { type: "string" },
          pageReferences: stringArray,
          awardedFor: stringArray,
          deductedFor: stringArray,
          feedback: { type: "string" },
          needsTeacherReview: { type: "boolean" },
        },
        required: ["question", "awarded", "studentAnswer", "pageReferences", "awardedFor", "deductedFor", "feedback", "needsTeacherReview"],
      },
    },
  },
  required: ["summary", "overallFeedback", "strengths", "weaknesses", "teacherNotes", "questionBreakdown"],
};
function invalid(message) {
  const error = new Error(message);
  error.status = 502;
  throw error;
}
function strings(value, label) {
  if (!Array.isArray(value) || value.some(item => typeof item !== "string")) {
    invalid(`AI returned invalid ${label}.`);
  }
  return value;
}
function text(value, label) {
  if (typeof value !== "string") invalid(`AI returned invalid ${label}.`);
  return value;
}
function validateRubric(value) {
  if (!Array.isArray(value?.questions) || !value.questions.length) {
    invalid("The documents did not produce a usable marking rubric.");
  }
  const seen = new Set();
  const questions = value.questions.map(item => {
    const question = text(item.question, "question label").trim();
    if (!question || seen.has(question)) invalid("The extracted rubric has missing or duplicate question labels.");
    seen.add(question);
    if (typeof item.possible !== "number" || !Number.isFinite(item.possible) || item.possible < 0) {
      invalid("The extracted rubric has invalid maximum marks.");
    }
    return {
      question,
      possible: item.possible,
      questionText: text(item.questionText, "question text"),
      markingPoints: strings(item.markingPoints, "marking points"),
      acceptedAnswers: strings(item.acceptedAnswers, "accepted answers"),
      commonErrors: strings(item.commonErrors, "common errors"),
      references: text(item.references, "document references"),
      uncertainties: strings(item.uncertainties, "rubric uncertainties"),
    };
  });
  const totalPossible = questions.reduce((sum, item) => sum + item.possible, 0);
  if (totalPossible <= 0) invalid("The rubric has no available marks.");
  return { questions, totalPossible, documentWarnings: strings(value.documentWarnings, "document warnings") };
}
function validateCorrection(value, rubric) {
  if (!Array.isArray(value?.questionBreakdown)) invalid("AI returned no question-by-question feedback.");
  const byQuestion = new Map();
  for (const item of value.questionBreakdown) {
    if (byQuestion.has(item.question)) invalid("AI returned duplicate question feedback.");
    byQuestion.set(item.question, item);
  }
  if (byQuestion.size !== rubric.questions.length) invalid("AI feedback does not cover every rubric question.");
  const questionBreakdown = rubric.questions.map(question => {
    const item = byQuestion.get(question.question);
    if (!item || typeof item.awarded !== "number" || !Number.isFinite(item.awarded) || item.awarded < 0 || item.awarded > question.possible) {
      invalid(`AI returned invalid marks for ${question.question}.`);
    }
    if (typeof item.needsTeacherReview !== "boolean") invalid("AI omitted review flags.");
    return {
      question: question.question,
      awarded: item.awarded,
      possible: question.possible,
      studentAnswer: text(item.studentAnswer, "student answer summary"),
      pageReferences: strings(item.pageReferences, "answer references"),
      awardedFor: strings(item.awardedFor, "awarded marks explanation"),
      deductedFor: strings(item.deductedFor, "deducted marks explanation"),
      feedback: text(item.feedback, "question feedback"),
      needsTeacherReview: item.needsTeacherReview || question.uncertainties.length > 0,
    };
  });
  const totalAwarded = questionBreakdown.reduce((sum, item) => sum + item.awarded, 0);
  return {
    summary: text(value.summary, "summary"),
    overallFeedback: text(value.overallFeedback, "overall feedback"),
    teacherNotes: text(value.teacherNotes, "teacher notes"),
    strengths: strings(value.strengths, "strengths"),
    weaknesses: strings(value.weaknesses, "weaknesses"),
    totalAwarded,
    totalPossible: rubric.totalPossible,
    percentage: Math.round(totalAwarded / rubric.totalPossible * 1000) / 10,
    questionBreakdown,
  };
}
module.exports = { rubricSchema, correctionSchema, validateRubric, validateCorrection };
