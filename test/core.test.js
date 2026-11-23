const test = require("node:test");
const assert = require("node:assert/strict");
const Core = require("../src/renderer/core.js");
const sentences = require("../src/data/sentences.json");

// 2026-11-18(수) 10:00 로컬 시각 기준
const NOW = new Date(2026, 10, 18, 10, 0, 0);
const s001 = sentences.find((sentence) => sentence.id === "s001");

function freshState(overrides = {}) {
  return Object.assign(Core.getDefaultState(), overrides);
}

function logEntry(date, contentId, isCorrect, score) {
  return {
    date: date.toISOString(),
    contentId,
    direction: "en-to-ko",
    score: score ?? (isCorrect ? 90 : 20),
    isCorrect,
    source: "sentence",
  };
}

test("콘텐츠 난이도 값은 core 의 세 가지 값만 쓴다", () => {
  const levels = new Set(sentences.map((sentence) => sentence.level));
  assert.deepEqual([...levels].sort(), [...Core.DIFFICULTIES].sort());
});

test("난이도 정규화: 한글·영문 대소문자를 같은 값으로 맞춘다", () => {
  assert.equal(Core.normalizeDifficulty("초급"), "beginner");
  assert.equal(Core.normalizeDifficulty("Intermediate"), "intermediate");
  assert.equal(Core.normalizeDifficulty("고급"), "advanced");
  assert.equal(Core.normalizeDifficulty("???"), "beginner");
  assert.equal(Core.getDifficultyLabel("intermediate"), "중급");
});

test("v4 상태 마이그레이션: 옛 카운터 제거, 난이도·학습유형 정리", () => {
  const v4 = {
    schemaVersion: 4,
    darkMode: true,
    onboardingSeen: true,
    streak: 3,
    sentenceCorrect: 7,
    vocabCorrect: 4,
    vocabIndex: 9,
    reviewList: ["s001", { contentId: "s002", level: 2, nextReviewAt: "2026-11-20T00:00:00.000Z" }, "s001"],
    studyLog: [logEntry(NOW, "s003", true), { broken: true }],
    settings: { difficulty: "Intermediate", learningType: "Sentence + Vocabulary + Expressions", popupTime: "7:5" },
  };
  const migrated = Core.migrateState(v4, NOW);
  assert.equal(migrated.schemaVersion, Core.CURRENT_SCHEMA_VERSION);
  assert.equal(migrated.darkMode, true);
  assert.equal(migrated.settings.difficulty, "intermediate");
  assert.equal(migrated.settings.learningType, "sentence");
  assert.equal(migrated.settings.popupTime, "08:30", "잘못된 시각은 기본값으로");
  assert.equal(migrated.profile, null);
  assert.equal(migrated.reviewList.length, 2, "중복 제거");
  assert.equal(migrated.studyLog.length, 1, "깨진 기록 제거");
  for (const key of ["sentenceCorrect", "vocabCorrect", "vocabIndex", "streak"]) {
    assert.equal(key in migrated, false, `${key} 제거`);
  }
});

test("더 새 스키마로 저장된 상태는 건드리지 않는다", () => {
  const future = { schemaVersion: 99, foo: 1 };
  assert.equal(Core.migrateState(future, NOW), future);
});

test("로컬 프로필: 닉네임 검증과 생성", () => {
  assert.notEqual(Core.validateNickname(""), "");
  assert.notEqual(Core.validateNickname("a"), "");
  assert.notEqual(Core.validateNickname("가".repeat(17)), "");
  assert.notEqual(Core.validateNickname("<b>"), "");
  assert.equal(Core.validateNickname("민수"), "");

  const state = freshState({ signedOut: true });
  Core.createProfile(state, { nickname: "  민수 ", difficulty: "고급", now: NOW });
  assert.equal(state.profile.nickname, "민수");
  assert.equal(state.settings.difficulty, "advanced");
  assert.equal(state.signedOut, false);
  assert.throws(() => Core.createProfile(state, { nickname: "x", difficulty: "beginner", now: NOW }));
});

test("복습 간격: level 0 은 다음 날, 이후 3·7·30일", () => {
  const base = Core.startOfDay(NOW);
  [1, 3, 7, 30].forEach((days, level) => {
    assert.equal(Core.getNextReviewDate(level, NOW), Core.addDays(base, days).toISOString());
  });
  assert.equal(Core.getNextReviewDate(9, NOW), Core.addDays(base, 30).toISOString());
});

test("submitAnswer: 오답이면 기록 + 복습 큐 추가(내일부터 대상)", () => {
  const state = freshState();
  const result = Core.submitAnswer(state, { contentId: "s001", direction: "en-to-ko", score: 30, now: NOW });
  assert.equal(result.isCorrect, false);
  assert.equal(result.reviewAction, "added");
  assert.equal(state.studyLog.length, 1);
  assert.equal(state.reviewList.length, 1);
  assert.equal(Core.getDueReviewItems(state, NOW).length, 0, "등록 당일에는 복습 대상 아님");
  assert.equal(Core.getDueReviewItems(state, Core.addDays(NOW, 1)).length, 1, "다음 날 복습 대상");
});

test("submitAnswer: 정답이면 기록만 하고 복습 큐에 넣지 않는다", () => {
  const state = freshState();
  const result = Core.submitAnswer(state, { contentId: "s001", direction: "en-to-ko", score: 85, now: NOW });
  assert.equal(result.isCorrect, true);
  assert.equal(result.reviewAction, "none");
  assert.equal(state.reviewList.length, 0);
  assert.equal(state.studyLog.length, 1);
  assert.equal(state.studyLog[0].isCorrect, true);
});

test("submitAnswer: 복습 항목은 정답이면 단계 상승, 오답이면 0단계로", () => {
  const state = freshState();
  Core.submitAnswer(state, { contentId: "s001", score: 10, now: NOW });
  const day2 = Core.addDays(NOW, 1);
  const promoted = Core.submitAnswer(state, { contentId: "s001", score: 100, source: "review", now: day2 });
  assert.equal(promoted.reviewAction, "promoted");
  assert.equal(state.reviewList[0].level, 1);
  assert.equal(state.reviewList[0].nextReviewAt, Core.addDays(Core.startOfDay(day2), 3).toISOString());

  const reset = Core.submitAnswer(state, { contentId: "s001", score: 0, source: "review", now: Core.addDays(NOW, 4) });
  assert.equal(reset.reviewAction, "reset");
  assert.equal(state.reviewList[0].level, 0);
});

test("60점이 정답 경계", () => {
  const state = freshState();
  assert.equal(Core.submitAnswer(state, { contentId: "a", score: 59, now: NOW }).isCorrect, false);
  assert.equal(Core.submitAnswer(state, { contentId: "b", score: 60, now: NOW }).isCorrect, true);
});

test("연속 학습일: 오늘 또는 어제까지 이어진 날 수", () => {
  const log = [
    logEntry(Core.addDays(NOW, -3), "a", true),
    logEntry(Core.addDays(NOW, -2), "b", true),
    logEntry(Core.addDays(NOW, -1), "c", false),
    logEntry(Core.addDays(NOW, -1), "d", true),
  ];
  assert.equal(Core.computeStreak(log, NOW), 3, "오늘 안 했어도 어제까지 이어짐");
  log.push(logEntry(NOW, "e", true));
  assert.equal(Core.computeStreak(log, NOW), 4);
  assert.equal(Core.computeStreak(log, Core.addDays(NOW, 2)), 0, "하루 빠지면 끊김");
  assert.equal(Core.countStudyDays(log), 4);
  assert.equal(Core.computeStreak([], NOW), 0);
});

test("오늘 진행도와 최근 7일 정답률", () => {
  const log = [
    logEntry(NOW, "a", true),
    logEntry(NOW, "b", false),
    logEntry(NOW, "c", true),
    logEntry(Core.addDays(NOW, -2), "d", false),
    logEntry(Core.addDays(NOW, -9), "e", true),
  ];
  const today = Core.getTodaySummary(log, NOW);
  assert.deepEqual(today, { total: 3, correct: 2, goal: 5, percent: 60 });

  const days = Core.getLast7Days(log, NOW);
  assert.equal(days.length, 7);
  assert.equal(days[6].isToday, true);
  assert.equal(days[6].accuracy, 67);
  assert.equal(days[6].label, "수");
  assert.equal(days[4].accuracy, 0);
  assert.equal(days[5].accuracy, null, "기록 없는 날은 null");
});

test("히트맵: 12주 x 7일, 마지막 열이 이번 주", () => {
  const log = [logEntry(NOW, "a", true), logEntry(NOW, "b", true), logEntry(NOW, "c", true)];
  const cells = Core.getHeatmap(log, NOW, 12);
  assert.equal(cells.length, 84);
  assert.equal(new Date(cells[0].key + "T00:00:00").getDay(), 1, "월요일부터 시작");
  const todayCell = cells.find((cell) => cell.key === Core.toDayKey(NOW));
  assert.equal(todayCell.count, 3);
  assert.equal(todayCell.level, 2);
  assert.equal(cells[cells.length - 1].future, true, "이번 주 일요일은 미래");
});

test("출석 격자: 지난주 월요일부터 14칸, 상태 구분", () => {
  const log = [logEntry(Core.addDays(NOW, -1), "a", true)];
  const cells = Core.getStreakCalendar(log, NOW);
  assert.equal(cells.length, 14);
  assert.equal(new Date(cells[0].key + "T00:00:00").getDay(), 1);
  const byKey = Object.fromEntries(cells.map((cell) => [cell.key, cell.status]));
  assert.equal(byKey[Core.toDayKey(Core.addDays(NOW, -1))], "active");
  assert.equal(byKey[Core.toDayKey(NOW)], "current");
  assert.equal(byKey[Core.toDayKey(Core.addDays(NOW, 1))], "pending");
  assert.equal(byKey[Core.toDayKey(Core.addDays(NOW, -2))], "missed");
});

test("문장 선정: 난이도 일치 + 미학습 순서, 소진되면 null", () => {
  const state = freshState();
  state.settings.difficulty = "advanced";
  const advanced = Core.getSentencesForDifficulty(sentences, "advanced");
  assert.ok(advanced.length > 0);
  assert.equal(Core.pickNextNewSentence(state, sentences).id, advanced[0].id);

  advanced.forEach((sentence) => Core.submitAnswer(state, { contentId: sentence.id, score: 100, now: NOW }));
  assert.equal(Core.pickNextNewSentence(state, sentences), null);
  const repeat = Core.pickRepeatSentence(state, sentences);
  assert.equal(repeat.level, "advanced");
});

test("데일리 팝업 선정: 복습 도래 문장이 먼저, 다음은 같은 난이도", () => {
  const state = freshState();
  state.settings.difficulty = "intermediate";
  Core.submitAnswer(state, { contentId: "s001", score: 0, now: Core.addDays(NOW, -1) });
  const picked = Core.pickPopupSentences(state, sentences, NOW, () => 0.5);
  assert.equal(picked.length, 2);
  assert.equal(picked[0].id, "s001");
  assert.equal(picked[1].level, "intermediate");
});

test("영→한 채점: 정답·띄어쓰기·동의어는 통과", () => {
  assert.equal(Core.scoreKoreanTranslation(s001.answer, s001), 100);
  assert.equal(Core.scoreKoreanTranslation("오늘아침에 휴대전화를 부엌 식탁 위에 두고 왔어요", s001), 100);
  assert.ok(Core.scoreKoreanTranslation("오늘 아침에 핸드폰을 부엌 식탁 위에 두고 왔어요.", s001) >= 90);
});

test("영→한 채점: 빈 답·무관한 답·반복 나열은 불합격", () => {
  assert.equal(Core.scoreKoreanTranslation("   ", s001), 0);
  assert.ok(Core.scoreKoreanTranslation("나는 학교에 간다", s001) < Core.PASS_SCORE);
  assert.ok(Core.scoreKoreanTranslation("식탁", s001) < Core.PASS_SCORE);
  const repeated = Array(3).fill(s001.answer).join(" ");
  assert.ok(Core.scoreKoreanTranslation(repeated, s001) < Core.PASS_SCORE, "정답을 여러 번 붙여 넣어도 통과 못 함");
});

test("영→한 채점: answers[] 의 다른 허용 답안도 인정", () => {
  const data = { answer: "그는 매일 운동한다.", answers: ["그 남자는 날마다 운동을 해요."], keywords: [] };
  assert.equal(Core.scoreKoreanTranslation("그 남자는 날마다 운동을 해요", data), 100);
});

test("한→영 채점: 대소문자·문장부호 무시, 반복·무관 답은 불합격", () => {
  assert.equal(Core.scoreEnglishSentence("i left my phone on the kitchen table this morning", s001), 100);
  assert.ok(Core.scoreEnglishSentence("I left my phone on the table this morning", s001) >= Core.PASS_SCORE);
  assert.ok(Core.scoreEnglishSentence("I am a boy", s001) < Core.PASS_SCORE);
  const repeated = `${s001.english} ${s001.english}`;
  assert.ok(Core.scoreEnglishSentence(repeated, s001) < Core.PASS_SCORE);
  assert.equal(Core.scoreEnglishSentence("", s001), 0);
});

test("영→한 채점: 핵심어만 나열한 답은 50문장 모두 불합격", () => {
  sentences.forEach((sentence) => {
    const listed = sentence.keywords.join(" ");
    assert.ok(Core.scoreKoreanTranslation(listed, sentence) < Core.PASS_SCORE, `${sentence.id}: "${listed}"`);
  });
});

test("영→한 채점: 조사를 모두 뗀 전보식 답은 감점, 조사를 바꿔 쓴 자연스러운 답은 통과", () => {
  assert.ok(Core.scoreKoreanTranslation("오늘 아침 휴대전화 부엌 식탁 위 두고 왔어요", s001) < Core.PASS_SCORE);
  assert.ok(Core.scoreKoreanTranslation("오늘 아침 핸드폰을 부엌 식탁에 두고 왔어", s001) >= Core.PASS_SCORE);
  assert.ok(Core.scoreKoreanTranslation("나는 오늘 아침 휴대폰을 부엌 테이블에 두고 나왔다", s001) >= Core.PASS_SCORE);
  // "결과", "이의" 처럼 조사처럼 끝나는 낱말을 조사로 착각하지 않는다.
  const s027 = sentences.find((sentence) => sentence.id === "s027");
  assert.ok(Core.scoreKoreanTranslation("그 연구 결과 오랫동안 의심받지 않았던 가정들 이의 제기", s027) < Core.PASS_SCORE);
});

test("한→영 채점: 관사·전치사·대명사를 모두 뺀 내용어 나열은 불합격", () => {
  assert.ok(Core.scoreEnglishSentence("left phone kitchen table this morning", s001) < Core.PASS_SCORE);
  assert.ok(Core.scoreEnglishSentence("This morning I left my phone on the kitchen table.", s001) >= Core.PASS_SCORE);
});

test("감점 이유 문구: 핵심어 나열·조사 누락·관사 누락일 때만 나온다", () => {
  assert.match(Core.getKoreanFormHint(s001.keywords.join(" "), s001), /핵심어만 나열/);
  assert.match(Core.getKoreanFormHint("오늘 아침 휴대전화 부엌 식탁 위 두고 왔어요", s001), /조사/);
  assert.equal(Core.getKoreanFormHint(s001.answer, s001), "");
  assert.match(Core.getEnglishFormHint("left phone kitchen table this morning", s001), /관사/);
  assert.equal(Core.getEnglishFormHint(s001.english, s001), "");
  assert.equal(Core.getKoreanFormHint("", s001), "");
});
