const prisma = require("../config/prisma");
const storage = require("./storage.service");

const TYPES = ["MCQ", "WRITTEN"];
const ANSWERS = ["A", "B", "C", "D"];
const fail = (status, msg) => {
  throw { status, msg };
};
const text = (value) =>
  typeof value === "string" ? value.trim() : "";
const optionalText = (value) => text(value) || null;

function normalizeType(value) {
  const type = text(value).toUpperCase();
  if (!TYPES.includes(type)) {
    fail(400, "Question type must be MCQ or WRITTEN");
  }
  return type;
}

function normalizePoints(value) {
  const points = Number(value);
  if (!Number.isFinite(points) || points <= 0) {
    fail(400, "Question points must be greater than zero");
  }
  return points;
}

function normalizeAnswer(type, value) {
  const answer = text(value).toUpperCase();
  if (type === "MCQ") {
    if (!ANSWERS.includes(answer)) {
      fail(400, "MCQ questions require a correct answer from A to D");
    }
    return answer;
  }
  if (answer) {
    fail(400, "Written questions cannot have a correct answer");
  }
  return null;
}

async function assertChapter(chapterId) {
  const id = text(chapterId);
  if (!id) fail(400, "Select a chapter for the question");
  const chapter = await prisma.chapter.findUnique({
    where: { id },
    select: { id: true },
  });
  if (!chapter) fail(400, "The selected chapter does not exist");
  return id;
}

const include = {
  chapter: {
    include: {
      unit: {
        include: {
          year: { select: { id: true, name: true } },
        },
      },
    },
  },
  _count: { select: { quizzes: true, checkpoints: true } },
};

async function getOwned(questionId, teacherId) {
  const question = await prisma.question.findFirst({
    where: { id: questionId, teacherId },
    include,
  });
  if (!question) fail(404, "Question not found");
  return question;
}

async function sign(question) {
  const [questionFileUrl, markschemeFileUrl] = await Promise.all([
    storage.getSignedUrl(question.questionFileUrl, 15),
    question.markschemeFileUrl
      ? storage.getSignedUrl(question.markschemeFileUrl, 15)
      : Promise.resolve(null),
  ]);
  return {
    ...question,
    questionFileKey: question.questionFileUrl,
    markschemeFileKey: question.markschemeFileUrl,
    questionFileUrl,
    markschemeFileUrl,
  };
}

async function createQuestion(input) {
  const title = text(input.title);
  if (!title) fail(400, "Question title is required");
  if (!input.teacherId) fail(401, "Unauthorized");
  if (!input.questionFile) {
    fail(400, "A question PDF or image is required");
  }

  const type = normalizeType(input.type);
  const chapterId = await assertChapter(input.chapterId);
  const points = normalizePoints(input.points);
  const correctAnswer = normalizeAnswer(type, input.correctAnswer);
  let questionKey;
  let markschemeKey;

  try {
    questionKey = await storage.uploadBuffer(
      input.questionFile.buffer,
      input.questionFile.originalname,
      input.questionFile.mimetype,
      "questions"
    );
    if (input.markschemeFile && type === "WRITTEN") {
      markschemeKey = await storage.uploadBuffer(
        input.markschemeFile.buffer,
        input.markschemeFile.originalname,
        input.markschemeFile.mimetype,
        "markschemes"
      );
    }
    return sign(
      await prisma.question.create({
        data: {
          title,
          reference: optionalText(input.reference),
          type,
          points,
          correctAnswer,
          questionFileUrl: questionKey,
          markschemeFileUrl: markschemeKey || null,
          teacherId: input.teacherId,
          chapterId,
        },
        include,
      })
    );
  } catch (error) {
    await Promise.all([
      questionKey ? storage.deleteFile(questionKey) : Promise.resolve(),
      markschemeKey ? storage.deleteFile(markschemeKey) : Promise.resolve(),
    ]);
    throw error;
  }
}

async function listQuestionsForTeacher(
  teacherId,
  { type, yearId, unitId, chapterId, search } = {}
) {
  if (!teacherId) fail(401, "Unauthorized");
  const query = text(search);
  const questions = await prisma.question.findMany({
    where: {
      teacherId,
      ...(type ? { type: normalizeType(type) } : {}),
      ...(chapterId ? { chapterId } : {}),
      ...(unitId ? { chapter: { unitId } } : {}),
      ...(yearId ? { chapter: { unit: { yearId } } } : {}),
      ...(query
        ? {
            OR: [
              { title: { contains: query, mode: "insensitive" } },
              { reference: { contains: query, mode: "insensitive" } },
              { chapter: { name: { contains: query, mode: "insensitive" } } },
            ],
          }
        : {}),
    },
    include,
    orderBy: { createdAt: "desc" },
  });
  return Promise.all(questions.map(sign));
}

async function getQuestionForTeacher(questionId, teacherId) {
  return sign(await getOwned(questionId, teacherId));
}

async function updateQuestion(questionId, teacherId, input) {
  const existing = await getOwned(questionId, teacherId);
  const title = input.title === undefined ? existing.title : text(input.title);
  if (!title) fail(400, "Question title is required");
  const type =
    input.type === undefined ? existing.type : normalizeType(input.type);
  const points =
    input.points === undefined ? existing.points : normalizePoints(input.points);
  const correctAnswer = normalizeAnswer(
    type,
    input.correctAnswer === undefined
      ? existing.correctAnswer
      : input.correctAnswer
  );
  const chapterId =
    input.chapterId === undefined
      ? existing.chapterId
      : await assertChapter(input.chapterId);
  let questionKey;
  let markschemeKey;

  try {
    if (input.questionFile) {
      questionKey = await storage.uploadBuffer(
        input.questionFile.buffer,
        input.questionFile.originalname,
        input.questionFile.mimetype,
        "questions"
      );
    }
    if (input.markschemeFile && type === "WRITTEN") {
      markschemeKey = await storage.uploadBuffer(
        input.markschemeFile.buffer,
        input.markschemeFile.originalname,
        input.markschemeFile.mimetype,
        "markschemes"
      );
    }
    const nextMarkscheme =
      type === "MCQ" || input.removeMarkscheme
        ? null
        : markschemeKey || existing.markschemeFileUrl;

    const question = await prisma.question.update({
      where: { id: questionId },
      data: {
        title,
        reference:
          input.reference === undefined
            ? existing.reference
            : optionalText(input.reference),
        type,
        points,
        correctAnswer,
        chapterId,
        questionFileUrl: questionKey || existing.questionFileUrl,
        markschemeFileUrl: nextMarkscheme,
      },
      include,
    });

    const oldFiles = [];
    if (questionKey) oldFiles.push(existing.questionFileUrl);
    if (
      existing.markschemeFileUrl &&
      existing.markschemeFileUrl !== nextMarkscheme
    ) {
      oldFiles.push(existing.markschemeFileUrl);
    }
    await Promise.all(oldFiles.map(storage.deleteFile));
    return sign(question);
  } catch (error) {
    await Promise.all([
      questionKey ? storage.deleteFile(questionKey) : Promise.resolve(),
      markschemeKey ? storage.deleteFile(markschemeKey) : Promise.resolve(),
    ]);
    throw error;
  }
}

async function deleteQuestion(questionId, teacherId) {
  const question = await getOwned(questionId, teacherId);
  if (question._count.quizzes) {
    fail(400, "Cannot delete a question that is used in a quiz");
  }
  if (question._count.checkpoints) {
    fail(400, "Cannot delete a question used by a video checkpoint");
  }
  await prisma.$transaction([
    prisma.questionTopic.deleteMany({ where: { questionId } }),
    prisma.question.delete({ where: { id: questionId } }),
  ]);
  await Promise.all([
    storage.deleteFile(question.questionFileUrl),
    question.markschemeFileUrl
      ? storage.deleteFile(question.markschemeFileUrl)
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

