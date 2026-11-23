// dist/speech.js, dist/taskXml.js 를 대상으로 한다 (npm test 가 먼저 tsc 빌드를 실행).
const test = require("node:test");
const assert = require("node:assert/strict");
const { speakEnglish, SPEAK_SCRIPT, MAX_SPEAK_LENGTH } = require("../dist/speech.js");
const { decodeConsoleOutput } = require("../dist/taskXml.js");

/** execFile 대역: 호출 내용을 기록하고, finish() 로 끝낸다 */
function fakeRunner() {
  const calls = [];
  const run = (file, args, options, callback) => {
    const call = { file, args, options, callback, killed: false };
    calls.push(call);
    return { kill: () => { call.killed = true; return true; } };
  };
  return { run, calls };
}

test("영어 읽기: 문장은 명령줄이 아니라 환경 변수로 넘기고 영어 음성을 고른다", async () => {
  const { run, calls } = fakeRunner();
  const text = `Say "hi"; Remove-Item C:\\ -Recurse $(whoami)`;
  const pending = speakEnglish(text, run, "win32");
  assert.equal(calls.length, 1);
  assert.equal(calls[0].file, "powershell.exe");
  assert.ok(!calls[0].args.join(" ").includes("whoami"), "문장이 명령줄에 들어가면 안 된다");
  assert.equal(calls[0].options.env.MOGUGEO_TTS_TEXT, text);
  assert.ok(calls[0].options.windowsHide);
  assert.match(SPEAK_SCRIPT, /Culture\.Name -like 'en-\*'/);
  calls[0].callback(null);
  assert.deepEqual(await pending, { ok: true });
});

test("영어 읽기: 영어 음성이 없으면 no-english-voice, 그 밖의 실패는 failed", async () => {
  const { run, calls } = fakeRunner();
  const first = speakEnglish("Hello.", run, "win32");
  calls[0].callback(Object.assign(new Error("exit 3"), { code: 3 }));
  assert.deepEqual(await first, { ok: false, reason: "no-english-voice" });
  const second = speakEnglish("Hello.", run, "win32");
  calls[1].callback(Object.assign(new Error("boom"), { code: 1 }));
  assert.deepEqual(await second, { ok: false, reason: "failed" });
});

test("영어 읽기: 새 문장을 누르면 읽던 문장은 멈추고 canceled", async () => {
  const { run, calls } = fakeRunner();
  const first = speakEnglish("First sentence.", run, "win32");
  const second = speakEnglish("Second sentence.", run, "win32");
  assert.ok(calls[0].killed, "앞 프로세스를 종료");
  calls[0].callback(Object.assign(new Error("killed"), { killed: true }));
  calls[1].callback(null);
  assert.deepEqual(await first, { ok: false, reason: "canceled" });
  assert.deepEqual(await second, { ok: true });
});

test("영어 읽기: 빈 문장·Windows 외 환경은 실행하지 않고, 긴 문장은 자른다", async () => {
  const { run, calls } = fakeRunner();
  assert.deepEqual(await speakEnglish("   ", run, "win32"), { ok: false, reason: "empty" });
  assert.deepEqual(await speakEnglish(42, run, "win32"), { ok: false, reason: "empty" });
  assert.deepEqual(await speakEnglish("Hello", run, "darwin"), { ok: false, reason: "unsupported" });
  assert.equal(calls.length, 0);
  const pending = speakEnglish("a".repeat(MAX_SPEAK_LENGTH + 50), run, "win32");
  assert.equal(calls[0].options.env.MOGUGEO_TTS_TEXT.length, MAX_SPEAK_LENGTH);
  calls[0].callback(null);
  await pending;
});

test("콘솔 출력 디코딩: UTF-8 그대로, 깨지면 CP949, UTF-16 BOM 처리", () => {
  assert.equal(decodeConsoleOutput(Buffer.from("SUCCESS: done", "utf8")), "SUCCESS: done");
  // "오류: 지정된 파일을 찾을 수 없습니다." 를 CP949 로 인코딩한 바이트
  const cp949 = Buffer.from("bfc0b7f93a20c1f6c1a4b5c820c6c4c0cfc0bb20c3a3c0bb20bcf620bef8bdc0b4cfb4d92e", "hex");
  assert.equal(decodeConsoleOutput(cp949), "오류: 지정된 파일을 찾을 수 없습니다.");
  const utf16 = Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from("<Task/>", "utf16le")]);
  assert.equal(decodeConsoleOutput(utf16), "<Task/>");
  assert.equal(decodeConsoleOutput(null), "");
});
