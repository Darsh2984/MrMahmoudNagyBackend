const fs = require("fs/promises");

function createServiceError(status, msg) {
  const error = new Error(msg);

  error.status = status;
  error.msg = msg;

  return error;
}

function requireFile(files, key, label) {
  const file = files?.[key]?.[0];

  if (!file) {
    throw createServiceError(
      400,
      `${label} PDF is required.`
    );
  }

  return file;
}

async function removeTempFiles(files) {
  const allFiles = Object.values(files || {})
    .flat()
    .filter(Boolean);

  await Promise.all(
    allFiles.map(async (file) => {
      try {
        if (file?.path) {
          await fs.unlink(file.path);
        }
      } catch {
        // Ignore temp cleanup errors.
      }
    })
  );
}

function safeJsonParse(text) {
  try {
    return JSON.parse(text);
  } catch {
    return {
      rawFeedback: text,
    };
  }
}

async function uploadPdfToGemini({
  ai,
  file,
  displayName,
}) {
  return ai.files.upload({
    file: file.path,

    config: {
      mimeType: "application/pdf",
      displayName,
    },
  });
}

async function correctPaper({
  files,
  teacherNote,
}) {
  if (!process.env.GEMINI_API_KEY) {
    throw createServiceError(
      500,
      "GEMINI_API_KEY is not configured."
    );
  }

  const questionPaper = requireFile(
    files,
    "questionPaper",
    "Question paper"
  );

  const markScheme = requireFile(
    files,
    "markScheme",
    "Mark scheme"
  );

  const studentAnswer = requireFile(
    files,
    "studentAnswer",
    "Student answer"
  );

  const {
    GoogleGenAI,
    createUserContent,
    createPartFromUri,
  } = await import("@google/genai");

  const ai = new GoogleGenAI({
    apiKey: process.env.GEMINI_API_KEY,
  });

  const model =
    process.env.GEMINI_MODEL ||
    "gemini-2.5-flash";

  const [
    questionPaperFile,
    markSchemeFile,
    studentAnswerFile,
  ] = await Promise.all([
    uploadPdfToGemini({
      ai,
      file: questionPaper,
      displayName: "Question Paper",
    }),

    uploadPdfToGemini({
      ai,
      file: markScheme,
      displayName: "Mark Scheme",
    }),

    uploadPdfToGemini({
      ai,
      file: studentAnswer,
      displayName: "Student Answer",
    }),
  ]);

  const prompt = `
You are an expert IGCSE / O Level / A Level exam marker.

You will receive:
1. The question paper PDF.
2. The official mark scheme PDF.
3. The student's answer PDF.

Your task:
- Correct the student's answers using the mark scheme.
- Be strict and exam-style.
- Do not invent marks that are not supported by the mark scheme.
- Give marks question by question.
- Explain missing marks clearly.
- Give feedback the teacher can send to the student.
- Identify repeated mistakes and weak topics.
- If handwriting or a page is unclear, mention it explicitly.
- If the mark scheme does not cover something clearly, mark it as "needs teacher review".

Teacher note:
${String(teacherNote || "").trim() || "No extra teacher note."}

Return ONLY valid JSON with this structure:
{
  "summary": "short overall summary",
  "totalAwarded": number,
  "totalPossible": number,
  "percentage": number,
  "gradeComment": "short grade-level comment",
  "questionBreakdown": [
    {
      "question": "question number or label",
      "awarded": number,
      "possible": number,
      "feedback": "specific feedback",
      "missingMarks": ["reason 1", "reason 2"],
      "needsTeacherReview": boolean
    }
  ],
  "strengths": ["strength 1", "strength 2"],
  "weaknesses": ["weakness 1", "weakness 2"],
  "studentFeedback": "clear feedback written directly to the student",
  "teacherNotes": "private notes for teacher"
}
`;

  const response =
    await ai.models.generateContent({
      model,

      contents: [
        createUserContent([
          {
            text: prompt,
          },

          createPartFromUri(
            questionPaperFile.uri,
            questionPaperFile.mimeType
          ),

          createPartFromUri(
            markSchemeFile.uri,
            markSchemeFile.mimeType
          ),

          createPartFromUri(
            studentAnswerFile.uri,
            studentAnswerFile.mimeType
          ),
        ]),
      ],

      config: {
        responseMimeType: "application/json",
      },
    });

  const text =
    response.text ||
    response.response?.text?.() ||
    "";

  if (!text.trim()) {
    throw createServiceError(
      502,
      "Gemini returned an empty correction."
    );
  }

  return safeJsonParse(text);
}

module.exports = {
  correctPaper,
  removeTempFiles,
};