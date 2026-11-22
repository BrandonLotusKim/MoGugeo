// dist/taskXml.js 를 대상으로 한다 (npm test 가 먼저 tsc 빌드를 실행).
const test = require("node:test");
const assert = require("node:assert/strict");
const { buildDailyPopupTaskXml, parseTaskTime, escapeXml } = require("../dist/taskXml.js");

const EXE = "C:\\Program Files\\모국어\\MoGugeo.exe";

test("작업 XML: 매일 지정 시각, --popup 인자, 놓친 실행 보충(StartWhenAvailable)", () => {
  const xml = buildDailyPopupTaskXml(EXE, "07:45", new Date(2026, 10, 18));
  assert.match(xml, /<StartBoundary>2026-11-18T07:45:00<\/StartBoundary>/);
  assert.match(xml, /<DaysInterval>1<\/DaysInterval>/);
  assert.match(xml, /<StartWhenAvailable>true<\/StartWhenAvailable>/);
  assert.match(xml, /<Arguments>--popup<\/Arguments>/);
  assert.ok(xml.includes(`<Command>${EXE}</Command>`));
  assert.match(xml, /<RunLevel>LeastPrivilege<\/RunLevel>/);
});

test("작업 XML: 잘못된 시각·빈 경로는 거부", () => {
  assert.throws(() => buildDailyPopupTaskXml(EXE, "25:00"));
  assert.throws(() => buildDailyPopupTaskXml(EXE, "7:5"));
  assert.throws(() => buildDailyPopupTaskXml("", "08:00"));
});

test("작업 XML: 경로의 특수문자는 이스케이프", () => {
  assert.equal(escapeXml(`a&b<c>"d'`), "a&amp;b&lt;c&gt;&quot;d&apos;");
  const xml = buildDailyPopupTaskXml("C:\\R&D\\app.exe", "08:00");
  assert.ok(xml.includes("<Command>C:\\R&amp;D\\app.exe</Command>"));
});

test("등록된 작업 XML 에서 시각을 읽는다", () => {
  const xml = buildDailyPopupTaskXml(EXE, "21:05", new Date(2026, 0, 2));
  assert.equal(parseTaskTime(xml), "21:05");
  assert.equal(parseTaskTime("<StartBoundary>2026-01-02T06:30:00+09:00</StartBoundary>"), "06:30");
  assert.equal(parseTaskTime("<Task/>"), null);
});
