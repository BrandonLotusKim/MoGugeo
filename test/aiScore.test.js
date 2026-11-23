const test = require("node:test");
const assert = require("node:assert/strict");
const { parseAiScore, buildPrompt, scoreWithGemini, GEMINI_MODELS } = require("../dist/aiScore.js");

const reply = (text) => ({ ok: true, json: async () => ({ candidates: [{ content: { parts: [{ text }] } }] }) });
const noKey = () => "";
const fixedKey = (provided) => provided || "k";

test("AI 응답 JSON: 점수는 0~100 정수로 맞추고 코멘트를 읽는다", () => {
  assert.deepEqual(parseAiScore('{"score": 87.6, "comment": "자연스러운 의역입니다."}'), { ok: true, score: 88, comment: "자연스러운 의역입니다." });
  assert.equal(parseAiScore('```json\n{"score": 140}\n```').score, 100);
  assert.equal(parseAiScore('{"score": -3}').score, 0);
});

test("AI 응답이 깨졌으면 실패로 돌려 규칙 채점으로 대체하게 한다", () => {
  assert.equal(parseAiScore("점수: 80").ok, false);
  assert.equal(parseAiScore('{"comment": "x"}').ok, false);
  assert.equal(parseAiScore(undefined).ok, false);
});

test("프롬프트에 방향, 원문, 모범 답안, 학습자 답이 들어간다", () => {
  const prompt = buildPrompt("ko-to-en", "안녕", "Hello", "Hi");
  assert.match(prompt, /한국어 문장을 영어로/);
  assert.match(prompt, /원문: 안녕/);
  assert.match(prompt, /모범 답안: Hello/);
  assert.match(prompt, /학습자 답: Hi/);
});

test("키가 어디에도 없으면 호출하지 않는다", async () => {
  let called = 0;
  const fakeFetch = async () => { called += 1; return reply("{}"); };
  assert.deepEqual(await scoreWithGemini({ source: "a", reference: "b", answer: "c" }, fakeFetch, noKey), { ok: false, reason: "no-key" });
  assert.equal(called, 0);
});

test("응답은 Gemini 형식에서 꺼내고, 한도 초과면 다음 모델로 넘어간다", async () => {
  const urls = [];
  const fakeFetch = async (url, init) => {
    urls.push(url);
    assert.equal(init.headers["x-goog-api-key"], "k");
    return urls.length === 1 ? { ok: false, status: 429, json: async () => ({}) } : reply('{"score":72,"comment":"좋아요"}');
  };
  const result = await scoreWithGemini({ direction: "en-to-ko", source: "a", reference: "b", answer: "c" }, fakeFetch, fixedKey);
  assert.deepEqual(result, { ok: true, score: 72, comment: "좋아요", model: GEMINI_MODELS[1] });
  assert.match(urls[0], new RegExp(GEMINI_MODELS[0]));
  const allFail = async () => ({ ok: false, status: 429, json: async () => ({}) });
  assert.deepEqual(await scoreWithGemini({ source: "a", reference: "b", answer: "c" }, allFail, fixedKey), { ok: false, reason: "http-429" });
});
