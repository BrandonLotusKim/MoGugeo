// Windows 음성(SAPI)으로 영어 문장 읽기 (electron 의존 없음 — 단위 테스트 대상)
// 브라우저 음성 목록에 영어 음성이 없을 때(한국어 음성만 보이는 Windows) 렌더러가 대신 요청한다.
import { execFile, type ChildProcess } from "node:child_process";

export type SpeakResult = { ok: boolean; reason?: "no-english-voice" | "canceled" | "unsupported" | "empty" | "failed" };

export const MAX_SPEAK_LENGTH = 500;
const NO_ENGLISH_VOICE_EXIT = 3;

// 읽을 문장은 환경 변수로 넘겨 명령줄 해석을 거치지 않는다.
export const SPEAK_SCRIPT = [
  "$ErrorActionPreference = 'Stop'",
  "Add-Type -AssemblyName System.Speech",
  "$s = New-Object System.Speech.Synthesis.SpeechSynthesizer",
  "$v = $s.GetInstalledVoices() | Where-Object { $_.Enabled -and $_.VoiceInfo.Culture.Name -like 'en-*' } | Select-Object -First 1",
  `if (-not $v) { exit ${NO_ENGLISH_VOICE_EXIT} }`,
  "$s.SelectVoice($v.VoiceInfo.Name)",
  "$s.Speak($env:MOGUGEO_TTS_TEXT)",
  "$s.Dispose()",
].join("; ");

type Runner = (
  file: string,
  args: string[],
  options: { windowsHide: boolean; env: NodeJS.ProcessEnv },
  callback: (error: (Error & { code?: number | string; killed?: boolean }) | null) => void,
) => ChildProcess | { kill: () => boolean };

type Job = { canceled: boolean; child: { kill: () => boolean } | null };
let currentJob: Job | null = null;

export function speakEnglish(
  text: unknown,
  run: Runner = execFile as unknown as Runner,
  platform: string = process.platform,
): Promise<SpeakResult> {
  if (platform !== "win32") return Promise.resolve({ ok: false, reason: "unsupported" });
  const content = typeof text === "string" ? text.trim().slice(0, MAX_SPEAK_LENGTH) : "";
  if (!content) return Promise.resolve({ ok: false, reason: "empty" });

  // 앞 문장을 읽는 중이면 멈추고 새 문장을 읽는다.
  if (currentJob) {
    currentJob.canceled = true;
    currentJob.child?.kill();
  }

  const job: Job = { canceled: false, child: null };
  currentJob = job;
  return new Promise((resolve) => {
    job.child = run(
      "powershell.exe",
      ["-NoProfile", "-NonInteractive", "-Command", SPEAK_SCRIPT],
      { windowsHide: true, env: { ...process.env, MOGUGEO_TTS_TEXT: content } },
      (error) => {
        if (currentJob === job) currentJob = null;
        if (job.canceled) {
          resolve({ ok: false, reason: "canceled" });
        } else if (!error) {
          resolve({ ok: true });
        } else if (error.code === NO_ENGLISH_VOICE_EXIT) {
          resolve({ ok: false, reason: "no-english-voice" });
        } else {
          resolve({ ok: false, reason: "failed" });
        }
      },
    );
  });
}
