const test = require("node:test");
const assert = require("node:assert/strict");
const { responseJson, generateRubricJson } = require("../src/services/geminiJson");
const response = (text, finishReason = "STOP") => ({ candidates: [{ finishReason, content: { parts: [{ text }] } }] });

test("parses JSON and enclosing fences without repairing missing data", () => {
  assert.deepEqual(responseJson(response('{"questions":[]}')), { questions: [] });
  assert.deepEqual(responseJson(response('```json\n{"questions":[]}\n```')), { questions: [] });
  assert.throws(() => responseJson(response('{"questions":[')), /malformed JSON/);
});
test("rejects truncated output even when text happens to parse", () => {
  assert.throws(() => responseJson(response('{}', 'MAX_TOKENS')), /output limit/);
});
test("rejects blocked and empty responses", () => {
  assert.throws(() => responseJson({ promptFeedback: { blockReason: 'SAFETY' } }), /blocked/);
  assert.throws(() => responseJson(response('', 'SAFETY')), /SAFETY/);
  assert.throws(() => responseJson(response('')), /empty response/);
});
test("excludes thinking parts", () => {
  const r = response('{}');
  r.candidates[0].content.parts.unshift({ thought: true, text: 'internal thought' });
  assert.deepEqual(responseJson(r), {});
});
test("retries truncation once with larger output budget and validates", async () => {
  const calls = [];
  const ai = { models: { generateContent: async request => {
    calls.push(request);
    return calls.length === 1 ? response('{', 'MAX_TOKENS') : response('{"ok":true}');
  } } };
  const result = await generateRubricJson(ai, { model: 'gemini-3-flash-preview' }, x => x);
  assert.equal(result.rubric.ok, true);
  assert.deepEqual(calls.map(x => x.config.maxOutputTokens), [32768, 65536]);
  assert.equal(calls[0].config.thinkingConfig.thinkingLevel, 'LOW');
});
test("does not retry blocked or invalid rubric semantics", async () => {
  let calls = 0;
  const ai = { models: { generateContent: async () => { calls++; return response('{}'); } } };
  await assert.rejects(generateRubricJson(ai, { model: 'gemini-2.5-flash' }, () => { throw new Error('Missing questions'); }), /Missing questions/);
  assert.equal(calls, 1);
});
test("repeated malformed response stops after two attempts", async () => {
  let calls = 0;
  const ai = { models: { generateContent: async () => { calls++; return response('{'); } } };
  await assert.rejects(generateRubricJson(ai, { model: 'gemini-3-flash-preview' }, x => x), /malformed JSON/);
  assert.equal(calls, 2);
});
