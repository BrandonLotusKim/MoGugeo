/**
 * Gemini API 로 번역 답안을 채점한다(메인 프로세스).
 * 키: 설정에서 넣은 값 → 환경변수 GEMINI_API_KEY → (Windows) 사용자 환경변수 레지스트리 순.
 * 실패하면 렌더러가 규칙 채점으로 돌아간다.
 */
import { execFileSync } from "node:child_process";

// 채점은 짧은 판단이라 응답이 빠른 lite(약 1초)를 먼저 쓰고,
// 한도 초과·일시 오류면 flash(수 초~10초 이상)로 넘어간다.
export const GEMINI_MODELS = ["gemini-3.5-flash-lite", "gemini-3.6-flash"];
const ENDPOINT = (model: string) => `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
const TIMEOUT_MS = 15000;
const MAX_TEXT = 500;

export type AiScoreResult =
  | { ok: true; score: number; comment: string; model?: string }
  | { ok: false; reason: string };

type Direction = "en-to-ko" | "ko-to-en";

function text(value: unknown): string {
  return typeof value === "string" ? value.trim().slice(0, MAX_TEXT) : "";
}

let registryKey: string | null | undefined;

/** setx 로 넣은 키는 이미 떠 있는 프로세스 환경에 없을 수 있어 레지스트리에서 직접 읽는다. */
export function resolveApiKey(provided: string): string {
  if (provided) return provided;
  const fromEnv = (process.env.GEMINI_API_KEY || "").trim();
  if (fromEnv) return fromEnv;
  if (process.platform !== "win32") return "";
  if (registryKey === undefined) {
    try {
      const out = execFileSync("reg", ["query", "HKCU\\Environment", "/v", "GEMINI_API_KEY"], { windowsHide: true, encoding: "utf8" });
      const match = out.match(/GEMINI_API_KEY\s+REG_\w+\s+(\S+)/);
      registryKey = match ? match[1] : null;
    } catch {
      registryKey = null;
    }
  }
  return registryKey || "";
}

export function buildPrompt(direction: Direction, source: string, reference: string, answer: string): string {
  const task = direction === "en-to-ko" ? "영어 문장을 한국어로 번역" : "한국어 문장을 영어로 번역";
  return [
    `학습자가 ${task}했습니다. 모범 답안과 뜻이 얼마나 같은지 0~100 점수로 채점하세요.`,
    "의역, 어순, 말투 차이는 감점하지 마세요. 빠지거나 틀린 의미와 문법 오류는 감점하세요.",
    "조사·어미(영어는 관사·전치사) 없이 단어만 나열한 답은 뜻이 통해도 문장이 아니므로 50점 이하로 주세요.",
    'JSON 하나로만 답하세요: {"score": 정수, "comment": "한국어 한 문장 피드백"}',
    `원문: ${source}`,
    `모범 답안: ${reference}`,
    `학습자 답: ${answer}`,
  ].join("\n");
}

export function parseAiScore(raw: unknown): AiScoreResult {
  if (typeof raw !== "string") return { ok: false, reason: "empty" };
  try {
    const body = raw.replace(/^```(?:json)?\s*|\s*```$/g, "");
    const data = JSON.parse(body) as { score?: unknown; comment?: unknown };
    const score = Number(data.score);
    if (!Number.isFinite(score)) return { ok: false, reason: "bad-score" };
    const comment = typeof data.comment === "string" ? data.comment.trim().slice(0, 200) : "";
    return { ok: true, score: Math.max(0, Math.min(100, Math.round(score))), comment };
  } catch {
    return { ok: false, reason: "bad-json" };
  }
}

export async function scoreWithGemini(
  payload: unknown,
  fetchImpl: typeof fetch = fetch,
  keyResolver: (provided: string) => string = resolveApiKey,
): Promise<AiScoreResult> {
  if (!payload || typeof payload !== "object") return { ok: false, reason: "invalid" };
  const p = payload as Record<string, unknown>;
  const apiKey = keyResolver(text(p.apiKey));
  const direction: Direction = p.direction === "ko-to-en" ? "ko-to-en" : "en-to-ko";
  const source = text(p.source);
  const reference = text(p.reference);
  const answer = text(p.answer);
  if (!apiKey) return { ok: false, reason: "no-key" };
  if (!source || !reference || !answer) return { ok: false, reason: "invalid" };

  const body = JSON.stringify({
    contents: [{ parts: [{ text: buildPrompt(direction, source, reference, answer) }] }],
    generationConfig: { responseMimeType: "application/json", temperature: 0 },
  });
  let last: AiScoreResult = { ok: false, reason: "no-model" };
  for (const model of GEMINI_MODELS) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const response = await fetchImpl(ENDPOINT(model), {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
        body,
        signal: controller.signal,
      });
      if (!response.ok) {
        last = { ok: false, reason: `http-${response.status}` };
        if ([404, 429, 500, 503].includes(response.status)) continue;
        return last;
      }
      const data = (await response.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
      const result = parseAiScore(data.candidates?.[0]?.content?.parts?.[0]?.text);
      return result.ok ? { ...result, model } : result;
    } catch {
      last = { ok: false, reason: controller.signal.aborted ? "timeout" : "network" };
      if (controller.signal.aborted) return last;
    } finally {
      clearTimeout(timer);
    }
  }
  return last;
}
