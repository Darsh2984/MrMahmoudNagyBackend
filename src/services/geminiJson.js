// Never repair truncated JSON: doing so can silently omit marking criteria.
function responseJson(response) {
  const candidate = response?.candidates?.[0];
  const reason = candidate?.finishReason;
  const blocked = response?.promptFeedback?.blockReason;
  const diagnostics = {
    finishReason: reason || null,
    blockReason: blocked || null,
    usage: response?.usageMetadata || {},
  };
  function reject(message, retryable = false) {
    throw Object.assign(new Error(message), { status: 502, retryable, diagnostics });
  }
  if (blocked) reject(`Gemini blocked the reference request (${blocked}). Review the documents before retrying.`);
  if (reason === "MAX_TOKENS") {
    reject("Gemini reached its output limit before completing the rubric. Use smaller reference papers if this persists.", true);
  }
  if (reason && reason !== "STOP") {
    reject(`Gemini stopped without completing the response (${reason}). Review the reference documents.`);
  }
  const parts = candidate?.content?.parts;
  let raw = Array.isArray(parts)
    ? parts.filter(part => !part.thought && typeof part.text === "string").map(part => part.text).join("")
    : response?.text;
  if (typeof raw !== "string" || !raw.trim()) reject("Gemini returned an empty response.", true);
  raw = raw.trim().replace(/^\uFEFF/, "");
  // Only remove an enclosing code fence, never guess missing JSON content.
  const fenced = raw.match(/^```(?:json)?\s*\n?([\s\S]*?)\n?```$/i);
  if (fenced) raw = fenced[1].trim();
  try { return JSON.parse(raw); }
  catch { reject("Gemini returned malformed JSON after generation. No partial rubric was saved.", true); }
}

async function generateRubricJson(ai, request, validate, context = {}) {
  for (let attempt = 0; attempt < 2; attempt++) {
    const config = {
      ...request.config,
      maxOutputTokens: attempt === 0 ? 32768 : 65536,
    };
    if (/gemini-3/i.test(request.model)) config.thinkingConfig = { thinkingLevel: "LOW" };
    else if (/gemini-2\.5/i.test(request.model)) config.thinkingConfig = { thinkingBudget: 1024 };
    try {
      const response = await ai.models.generateContent({ ...request, config });
      const rubric = validate(responseJson(response));
      return { response, rubric };
    } catch (error) {
      // Metadata only: do not log documents, signed URLs, or model answer text.
      console.warn("Gemini rubric generation failed", {
        ...context, model: request.model, attempt: attempt + 1,
        ...(error.diagnostics || {}),
      });
      if (!error.retryable || attempt === 1) throw error;
    }
  }
}

module.exports = { responseJson, generateRubricJson };
