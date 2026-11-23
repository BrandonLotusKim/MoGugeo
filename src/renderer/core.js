/*
 * 모국어 핵심 로직 (DOM 없음)
 * - 상태 스키마/마이그레이션, 채점, 복습 간격, 학습 기록 집계
 * - 브라우저에서는 window.MoGugeoCore, Node(단위 테스트)에서는 module.exports 로 노출
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) {
    module.exports = api;
  } else {
    root.MoGugeoCore = api;
  }
})(typeof self !== "undefined" ? self : this, function () {
  const CURRENT_SCHEMA_VERSION = 5;
  const PASS_SCORE = 60;
  const DAILY_GOAL = 5;
  const REVIEW_INTERVAL_DAYS = [1, 3, 7, 30];
  const DIFFICULTIES = ["beginner", "intermediate", "advanced"];
  const DIFFICULTY_LABELS = { beginner: "초급", intermediate: "중급", advanced: "고급" };
  const DEFAULT_DIFFICULTY = "beginner";
  const WEEKDAY_LABELS = ["일", "월", "화", "수", "목", "금", "토"];
  const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;

  /* ---------- 날짜 ---------- */

  function toDate(value) {
    if (value instanceof Date) return new Date(value.getTime());
    if (value === undefined || value === null) return new Date();
    return new Date(value);
  }

  function startOfDay(value) {
    const date = toDate(value);
    date.setHours(0, 0, 0, 0);
    return date;
  }

  function addDays(value, days) {
    const date = toDate(value);
    date.setDate(date.getDate() + days);
    return date;
  }

  function pad2(value) {
    return String(value).padStart(2, "0");
  }

  /** 로컬 시간 기준 YYYY-MM-DD */
  function toDayKey(value) {
    const date = toDate(value);
    if (Number.isNaN(date.getTime())) return "";
    return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
  }

  /* ---------- 난이도 ---------- */

  const DIFFICULTY_ALIASES = {
    beginner: "beginner",
    "초급": "beginner",
    easy: "beginner",
    intermediate: "intermediate",
    "중급": "intermediate",
    medium: "intermediate",
    advanced: "advanced",
    "고급": "advanced",
    hard: "advanced",
  };

  function normalizeDifficulty(value, fallback = DEFAULT_DIFFICULTY) {
    const key = String(value || "").trim().toLowerCase();
    return DIFFICULTY_ALIASES[key] || fallback;
  }

  function getDifficultyLabel(value) {
    return DIFFICULTY_LABELS[normalizeDifficulty(value)];
  }

  /* ---------- 상태 ---------- */

  function getDefaultSettings() {
    return {
      dailyPopupEnabled: true,
      popupTime: "08:30",
      autoStart: true,
      autoLogin: true,
      difficulty: DEFAULT_DIFFICULTY,
      learningType: "sentence",
    };
  }

  function getDefaultState() {
    return {
      schemaVersion: CURRENT_SCHEMA_VERSION,
      darkMode: false,
      onboardingSeen: false,
      signedOut: false,
      profile: null,
      lastPopupDate: null,
      reviewList: [],
      studyLog: [],
      settings: getDefaultSettings(),
    };
  }

  function isPlainObject(value) {
    return Boolean(value) && typeof value === "object" && !Array.isArray(value);
  }

  function normalizeSettings(settings) {
    const defaults = getDefaultSettings();
    const source = isPlainObject(settings) ? settings : {};
    return {
      dailyPopupEnabled: typeof source.dailyPopupEnabled === "boolean"
        ? source.dailyPopupEnabled
        : defaults.dailyPopupEnabled,
      popupTime: typeof source.popupTime === "string" && TIME_PATTERN.test(source.popupTime)
        ? source.popupTime
        : defaults.popupTime,
      autoStart: typeof source.autoStart === "boolean" ? source.autoStart : defaults.autoStart,
      autoLogin: typeof source.autoLogin === "boolean" ? source.autoLogin : defaults.autoLogin,
      difficulty: normalizeDifficulty(source.difficulty, defaults.difficulty),
      // 현재 제공하는 학습 유형은 문장 해석 하나뿐이다.
      learningType: "sentence",
    };
  }

  function normalizeProfile(profile) {
    if (!isPlainObject(profile)) return null;
    const nickname = typeof profile.nickname === "string" ? profile.nickname.trim() : "";
    if (validateNickname(nickname)) return null;
    return {
      nickname,
      createdAt: typeof profile.createdAt === "string" ? profile.createdAt : new Date().toISOString(),
    };
  }

  function normalizeStudyLog(studyLog) {
    if (!Array.isArray(studyLog)) return [];
    return studyLog.filter((entry) => (
      isPlainObject(entry)
      && typeof entry.contentId === "string"
      && entry.contentId
      && !Number.isNaN(Date.parse(entry.date))
    )).map((entry) => {
      const score = Math.max(0, Math.min(100, Math.round(Number(entry.score) || 0)));
      return {
        date: entry.date,
        contentId: entry.contentId,
        direction: entry.direction === "ko-to-en" ? "ko-to-en" : "en-to-ko",
        score,
        isCorrect: typeof entry.isCorrect === "boolean" ? entry.isCorrect : score >= PASS_SCORE,
        source: typeof entry.source === "string" ? entry.source : "popup",
      };
    });
  }

  /**
   * 저장된 상태(어느 버전이든)를 현재 스키마로 맞춘다.
   * v4 이하에서 쓰던 카운터(sentenceCorrect, vocab*)는 버리고 studyLog 를 정본으로 쓴다.
   */
  function migrateState(saved, now) {
    if (!isPlainObject(saved)) return getDefaultState();
    const version = Number.isInteger(saved.schemaVersion) ? saved.schemaVersion : 0;
    if (version > CURRENT_SCHEMA_VERSION) {
      // 더 새 버전에서 저장된 값은 건드리지 않는다.
      return saved;
    }

    const base = getDefaultState();
    return {
      schemaVersion: CURRENT_SCHEMA_VERSION,
      darkMode: typeof saved.darkMode === "boolean" ? saved.darkMode : base.darkMode,
      onboardingSeen: typeof saved.onboardingSeen === "boolean" ? saved.onboardingSeen : base.onboardingSeen,
      signedOut: typeof saved.signedOut === "boolean" ? saved.signedOut : base.signedOut,
      profile: normalizeProfile(saved.profile),
      lastPopupDate: typeof saved.lastPopupDate === "string" ? saved.lastPopupDate : null,
      reviewList: normalizeReviewList(saved.reviewList, now),
      studyLog: normalizeStudyLog(saved.studyLog),
      settings: normalizeSettings(saved.settings),
    };
  }

  /* ---------- 프로필 ---------- */

  function validateNickname(value) {
    const nickname = String(value || "").trim();
    if (!nickname) return "닉네임을 입력하세요.";
    if (nickname.length < 2 || nickname.length > 16) return "닉네임은 2~16자로 입력하세요.";
    if (/[<>"'`]/.test(nickname)) return "닉네임에 < > \" ' ` 기호는 쓸 수 없습니다.";
    return "";
  }

  function createProfile(state, { nickname, difficulty, now }) {
    const error = validateNickname(nickname);
    if (error) throw new Error(error);
    state.profile = {
      nickname: String(nickname).trim(),
      createdAt: toDate(now).toISOString(),
    };
    state.settings = normalizeSettings(Object.assign({}, state.settings, { difficulty }));
    state.signedOut = false;
    return state.profile;
  }

  /* ---------- 복습 큐 ---------- */

  function getNextReviewDate(level, now) {
    const normalizedLevel = Math.max(0, Math.min(REVIEW_INTERVAL_DAYS.length - 1, Number(level) || 0));
    return addDays(startOfDay(now), REVIEW_INTERVAL_DAYS[normalizedLevel]).toISOString();
  }

  function normalizeReviewList(reviewList, now) {
    if (!Array.isArray(reviewList)) return [];
    const seen = new Set();
    const items = [];
    reviewList.forEach((entry) => {
      let item = null;
      if (typeof entry === "string" && entry.trim()) {
        item = {
          contentId: entry.trim(),
          type: "sentence",
          level: 0,
          nextReviewAt: getNextReviewDate(0, now),
          lastReviewedAt: null,
        };
      } else if (isPlainObject(entry)) {
        const contentId = typeof entry.contentId === "string" ? entry.contentId.trim() : "";
        if (!contentId) return;
        item = {
          contentId,
          type: "sentence",
          level: Math.max(0, Math.min(3, Number(entry.level) || 0)),
          nextReviewAt: typeof entry.nextReviewAt === "string" && !Number.isNaN(Date.parse(entry.nextReviewAt))
            ? entry.nextReviewAt
            : getNextReviewDate(0, now),
          lastReviewedAt: typeof entry.lastReviewedAt === "string" ? entry.lastReviewedAt : null,
        };
      }
      if (!item || seen.has(item.contentId)) return;
      seen.add(item.contentId);
      items.push(item);
    });
    return items;
  }

  function findReviewItem(state, contentId) {
    return state.reviewList.find((item) => item.contentId === contentId) || null;
  }

  /** 새 항목은 level 0, 다음 날부터 복습 대상 */
  function addReviewItem(state, contentId, now) {
    if (!contentId || findReviewItem(state, contentId)) return false;
    state.reviewList.push({
      contentId,
      type: "sentence",
      level: 0,
      nextReviewAt: getNextReviewDate(0, now),
      lastReviewedAt: null,
    });
    return true;
  }

  /** 정답이면 한 단계 올리고(1→3→7→30일), 오답이면 level 0 으로 되돌린다. */
  function updateReviewItem(state, contentId, isCorrect, now) {
    const item = findReviewItem(state, contentId);
    if (!item) return false;
    item.lastReviewedAt = toDate(now).toISOString();
    item.level = isCorrect ? Math.min(item.level + 1, REVIEW_INTERVAL_DAYS.length - 1) : 0;
    item.nextReviewAt = getNextReviewDate(item.level, now);
    return true;
  }

  function removeReviewItem(state, contentId) {
    const before = state.reviewList.length;
    state.reviewList = state.reviewList.filter((item) => item.contentId !== contentId);
    return state.reviewList.length !== before;
  }

  function getDueReviewItems(state, now) {
    const time = toDate(now).getTime();
    return state.reviewList.filter((item) => Date.parse(item.nextReviewAt) <= time);
  }

  /* ---------- 학습 기록 ---------- */

  /**
   * 채점이 끝난 답안 하나를 기록하는 유일한 진입점 (문장 해석·복습·데일리 팝업 공용)
   * - studyLog 에 1건 기록
   * - 복습 큐: 이미 있으면 정오에 따라 단계 갱신, 없고 오답이면 새로 추가
   */
  function submitAnswer(state, { contentId, direction, score, source, now }) {
    if (!contentId) throw new Error("contentId is required");
    const normalizedScore = Math.max(0, Math.min(100, Math.round(Number(score) || 0)));
    const isCorrect = normalizedScore >= PASS_SCORE;
    const at = toDate(now);

    state.studyLog.push({
      date: at.toISOString(),
      contentId,
      direction: direction === "ko-to-en" ? "ko-to-en" : "en-to-ko",
      score: normalizedScore,
      isCorrect,
      source: source || "sentence",
    });

    let reviewAction = "none";
    if (findReviewItem(state, contentId)) {
      updateReviewItem(state, contentId, isCorrect, at);
      reviewAction = isCorrect ? "promoted" : "reset";
    } else if (!isCorrect) {
      addReviewItem(state, contentId, at);
      reviewAction = "added";
    }

    return { score: normalizedScore, isCorrect, reviewAction };
  }

  function getStudyDayKeys(studyLog) {
    const keys = new Set();
    (studyLog || []).forEach((entry) => {
      const key = toDayKey(entry.date);
      if (key) keys.add(key);
    });
    return keys;
  }

  function countStudyDays(studyLog) {
    return getStudyDayKeys(studyLog).size;
  }

  /** 오늘(또는 오늘 아직 안 했으면 어제)까지 이어진 연속 학습일 */
  function computeStreak(studyLog, now) {
    const keys = getStudyDayKeys(studyLog);
    let cursor = startOfDay(now);
    if (!keys.has(toDayKey(cursor))) {
      cursor = addDays(cursor, -1);
    }
    let streak = 0;
    while (keys.has(toDayKey(cursor))) {
      streak += 1;
      cursor = addDays(cursor, -1);
    }
    return streak;
  }

  function getEntriesOnDay(studyLog, day) {
    const key = toDayKey(day);
    return (studyLog || []).filter((entry) => toDayKey(entry.date) === key);
  }

  function getTodaySummary(studyLog, now) {
    const entries = getEntriesOnDay(studyLog, now);
    const correct = entries.filter((entry) => entry.isCorrect).length;
    return {
      total: entries.length,
      correct,
      goal: DAILY_GOAL,
      percent: Math.min(100, Math.round((entries.length / DAILY_GOAL) * 100)),
    };
  }

  /** 최근 7일(오늘 포함) 날짜별 정답률. 기록 없는 날은 accuracy=null */
  function getLast7Days(studyLog, now) {
    const today = startOfDay(now);
    const days = [];
    for (let offset = 6; offset >= 0; offset -= 1) {
      const day = addDays(today, -offset);
      const entries = getEntriesOnDay(studyLog, day);
      const correct = entries.filter((entry) => entry.isCorrect).length;
      days.push({
        key: toDayKey(day),
        label: WEEKDAY_LABELS[day.getDay()],
        isToday: offset === 0,
        total: entries.length,
        correct,
        accuracy: entries.length ? Math.round((correct / entries.length) * 100) : null,
      });
    }
    return days;
  }

  function getHeatLevel(count) {
    if (count <= 0) return 0;
    if (count <= 2) return 1;
    if (count <= 4) return 2;
    if (count <= 7) return 3;
    return 4;
  }

  /**
   * 최근 N주 학습 빈도. 열=주(월~일), 행=요일. 마지막 열이 이번 주.
   * 반환은 열 우선 순서(주별로 월→일).
   */
  function getHeatmap(studyLog, now, weeks = 12) {
    const today = startOfDay(now);
    const mondayOffset = (today.getDay() + 6) % 7;
    const thisMonday = addDays(today, -mondayOffset);
    const start = addDays(thisMonday, -(weeks - 1) * 7);
    const counts = new Map();
    (studyLog || []).forEach((entry) => {
      const key = toDayKey(entry.date);
      if (key) counts.set(key, (counts.get(key) || 0) + 1);
    });

    const cells = [];
    for (let index = 0; index < weeks * 7; index += 1) {
      const day = addDays(start, index);
      const key = toDayKey(day);
      const count = counts.get(key) || 0;
      cells.push({
        key,
        count,
        level: getHeatLevel(count),
        future: day.getTime() > today.getTime(),
      });
    }
    return cells;
  }

  /** 대시보드 2주 격자: 지난주 월요일 ~ 이번 주 일요일 */
  function getStreakCalendar(studyLog, now) {
    const today = startOfDay(now);
    const mondayOffset = (today.getDay() + 6) % 7;
    const start = addDays(today, -mondayOffset - 7);
    const keys = getStudyDayKeys(studyLog);
    const cells = [];
    for (let index = 0; index < 14; index += 1) {
      const day = addDays(start, index);
      const key = toDayKey(day);
      const studied = keys.has(key);
      let status = "missed";
      if (day.getTime() > today.getTime()) status = "pending";
      else if (studied) status = "active";
      else if (day.getTime() === today.getTime()) status = "current";
      cells.push({ key, day: day.getDate(), status, isToday: day.getTime() === today.getTime() });
    }
    return cells;
  }

  function getLatestEntry(studyLog) {
    if (!Array.isArray(studyLog) || !studyLog.length) return null;
    return studyLog.reduce((latest, entry) => (
      Date.parse(entry.date) >= Date.parse(latest.date) ? entry : latest
    ));
  }

  /* ---------- 문제 선정 ---------- */

  function getSentenceId(sentence) {
    return (sentence && (sentence.id || sentence.english)) || "";
  }

  function getStudiedIds(studyLog) {
    return new Set((studyLog || []).map((entry) => entry.contentId).filter(Boolean));
  }

  function getSentencesForDifficulty(sentences, difficulty) {
    const target = normalizeDifficulty(difficulty);
    return (sentences || []).filter((sentence) => normalizeDifficulty(sentence.level, "") === target);
  }

  /** 오늘 복습할 문장 목록 (도래 순) */
  function getDueSentences(state, sentences, now) {
    const map = new Map((sentences || []).map((sentence) => [getSentenceId(sentence), sentence]));
    return getDueReviewItems(state, now)
      .slice()
      .sort((a, b) => Date.parse(a.nextReviewAt) - Date.parse(b.nextReviewAt))
      .map((item) => map.get(item.contentId))
      .filter(Boolean);
  }

  /** 난이도에 맞고 아직 풀지 않은 문장 중 첫 번째. 모두 풀었으면 null */
  function pickNextNewSentence(state, sentences, excludeIds) {
    const studied = getStudiedIds(state.studyLog);
    const exclude = excludeIds || new Set();
    return getSentencesForDifficulty(sentences, state.settings.difficulty)
      .find((sentence) => !studied.has(getSentenceId(sentence)) && !exclude.has(getSentenceId(sentence))) || null;
  }

  /** 난이도 문장을 모두 푼 뒤 다시 풀 때: 가장 오래전에 푼 문장부터 */
  function pickRepeatSentence(state, sentences, excludeIds) {
    const lastSeen = new Map();
    (state.studyLog || []).forEach((entry) => {
      const time = Date.parse(entry.date);
      if (!lastSeen.has(entry.contentId) || lastSeen.get(entry.contentId) < time) {
        lastSeen.set(entry.contentId, time);
      }
    });
    const exclude = excludeIds || new Set();
    const candidates = getSentencesForDifficulty(sentences, state.settings.difficulty)
      .filter((sentence) => !exclude.has(getSentenceId(sentence)));
    if (!candidates.length) return null;
    return candidates.slice().sort((a, b) => (
      (lastSeen.get(getSentenceId(a)) || 0) - (lastSeen.get(getSentenceId(b)) || 0)
    ))[0];
  }

  function shuffle(items, random) {
    const rng = typeof random === "function" ? random : Math.random;
    const copy = items.slice();
    for (let i = copy.length - 1; i > 0; i -= 1) {
      const j = Math.floor(rng() * (i + 1));
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
  }

  /** 데일리 팝업 2문제: 복습 도래 → 난이도 일치 미학습 → 같은 난이도 재출제 → 전체 */
  function pickPopupSentences(state, sentences, now, random) {
    const selected = [];
    const ids = new Set();
    function take(list) {
      list.forEach((sentence) => {
        const id = getSentenceId(sentence);
        if (selected.length >= 2 || !id || ids.has(id)) return;
        selected.push(sentence);
        ids.add(id);
      });
    }
    const studied = getStudiedIds(state.studyLog);
    const sameLevel = getSentencesForDifficulty(sentences, state.settings.difficulty);
    take(getDueSentences(state, sentences, now));
    take(shuffle(sameLevel.filter((sentence) => !studied.has(getSentenceId(sentence))), random));
    take(shuffle(sameLevel, random));
    take(shuffle(sentences || [], random));
    return selected;
  }

  /* ---------- 채점 ---------- */

  function levenshtein(a, b) {
    const rows = a.length + 1;
    const cols = b.length + 1;
    const dp = Array.from({ length: rows }, () => Array(cols).fill(0));
    for (let i = 0; i < rows; i += 1) dp[i][0] = i;
    for (let j = 0; j < cols; j += 1) dp[0][j] = j;
    for (let i = 1; i < rows; i += 1) {
      for (let j = 1; j < cols; j += 1) {
        const cost = a[i - 1] === b[j - 1] ? 0 : 1;
        dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
      }
    }
    return dp[a.length][b.length];
  }

  // 긴 어미·조사부터 한 번만 떼어 낸다.
  const KO_ENDINGS = [
    "입니다", "합니다", "습니다", "있어요", "에서는", "에서", "으로", "해요", "이다",
    // 해요체·합니다체·해라체 차이는 같은 뜻으로 본다(느꼈습니다 = 느꼈어요 = 느꼈다).
    "어요", "아요", "예요", "에요", "세요", "니다",
    "에게", "까지", "부터", "은", "는", "이", "가", "을", "를", "에", "로", "와", "과", "도", "의",
    "요", "다",
  ];

  // 같은 뜻으로 인정하는 낱말 (작은 의역 사전)
  const KO_SYNONYMS = {
    "핸드폰": "휴대전화",
    "휴대폰": "휴대전화",
    "폰": "휴대전화",
    "스마트폰": "휴대전화",
    "저": "나",
    "제": "내",
    "저희": "우리",
    "식탁위": "식탁",
    "테이블": "식탁",
    "주방": "부엌",
    "드디어": "마침내",
    "후": "뒤",
  };

  function stripKoreanEnding(token) {
    for (let i = 0; i < KO_ENDINGS.length; i += 1) {
      const ending = KO_ENDINGS[i];
      if (token.length > ending.length && token.endsWith(ending)) {
        return token.slice(0, -ending.length);
      }
    }
    return token;
  }

  function normalizeKoreanToken(token) {
    const cleaned = String(token || "")
      .toLowerCase()
      .replace(/^[^0-9a-z가-힣]+|[^0-9a-z가-힣]+$/g, "");
    if (!cleaned) return "";
    const synonym = KO_SYNONYMS[cleaned];
    if (synonym) return synonym;
    const stripped = stripKoreanEnding(cleaned);
    return KO_SYNONYMS[stripped] || stripped;
  }

  function tokenizeKorean(text) {
    return String(text || "")
      .split(/\s+/)
      .map(normalizeKoreanToken)
      .filter(Boolean);
  }

  function compactKorean(text) {
    return tokenizeKorean(text).join("");
  }

  /** 기대 토큰과 사용자 토큰을 1:1 로 맞춰 본다 (오타 20% 허용). */
  function matchTokens(expectedTokens, userTokens) {
    const used = new Set();
    let matched = 0;
    expectedTokens.forEach((expected) => {
      for (let i = 0; i < userTokens.length; i += 1) {
        if (used.has(i)) continue;
        const user = userTokens[i];
        const threshold = Math.ceil(Math.max(expected.length, user.length) * 0.2);
        if (user === expected || levenshtein(expected, user) <= threshold) {
          used.add(i);
          matched += 1;
          return;
        }
      }
    });
    return matched;
  }

  function lengthPenalty(expectedCount, userCount) {
    const limit = Math.max(expectedCount * 1.5, expectedCount + 2);
    return userCount > limit ? limit / userCount : 1;
  }

  /*
   * 문장 형태 보정: 핵심어만 나열하거나 조사·어미를 떼어 낸 전보식 답은 뜻이 맞아도 문장이 아니다.
   * - 모범 답안에서 조사가 붙은 낱말을 답안에서 맨 낱말로만 썼다면 그 비율만큼 깎는다(최대 45%).
   * - 답안이 제시된 핵심어를 이어 붙인 것뿐이면(핵심어 밖 글자가 20% 미만) 최저 비율을 적용한다.
   */
  const FORM_FLOOR = 0.55;

  function formFactor(consideredCount, keptCount) {
    if (consideredCount < 2) return 1;
    const needed = Math.ceil(consideredCount / 2);
    return FORM_FLOOR + (1 - FORM_FLOOR) * Math.min(1, keptCount / needed);
  }

  function cleanKoreanSurface(token) {
    return String(token || "").toLowerCase().replace(/^[^0-9a-z가-힣]+|[^0-9a-z가-힣]+$/g, "");
  }

  // 형태 보정은 조사만 본다(서술어 어미는 문체 차이라서 제외).
  const KO_PARTICLES = [
    "에서는", "에서", "으로", "에게", "까지", "부터",
    "은", "는", "이", "가", "을", "를", "에", "로", "와", "과", "도", "의",
  ];

  function stripKoreanParticle(token) {
    const particle = KO_PARTICLES.find((item) => token.length > item.length && token.endsWith(item));
    return particle ? token.slice(0, -particle.length) : token;
  }

  function koreanParticleFactor(userAnswer, answer) {
    const userSurfaces = String(userAnswer || "").split(/\s+/).map(cleanKoreanSurface).filter(Boolean);
    let considered = 0;
    let kept = 0;
    String(answer || "").split(/\s+/).map(cleanKoreanSurface).filter(Boolean).forEach((surface) => {
      const stem = stripKoreanParticle(surface);
      if (stem === surface) return; // 조사·어미가 없는 낱말
      if (userSurfaces.includes(stem)) {
        considered += 1; // 같은 낱말을 조사 없이 씀
      } else if (userSurfaces.some((user) => user.length > stem.length && user.startsWith(stem))) {
        considered += 1;
        kept += 1; // 조사·어미를 붙여 씀(다른 조사여도 인정)
      }
    });
    return formFactor(considered, kept);
  }

  function isKeywordListing(userAnswer, keywords) {
    const compact = String(userAnswer || "").replace(/[^0-9a-zA-Z가-힣]/g, "");
    if (!compact || !Array.isArray(keywords) || !keywords.length) return false;
    let rest = compact;
    keywords
      .map((keyword) => String(keyword || "").replace(/[^0-9a-zA-Z가-힣]/g, ""))
      .filter(Boolean)
      .sort((a, b) => b.length - a.length)
      .forEach((keyword) => {
        rest = rest.split(keyword).join("");
      });
    return rest.length / compact.length < 0.2;
  }

  function koreanFormFactor(userAnswer, answer, keywords) {
    const factor = koreanParticleFactor(userAnswer, answer);
    return isKeywordListing(userAnswer, keywords) ? Math.min(factor, FORM_FLOOR) : factor;
  }

  function scoreKoreanAgainst(userAnswer, answer, keywords) {
    const expected = tokenizeKorean(answer);
    const user = tokenizeKorean(userAnswer);
    if (!expected.length || !user.length) return 0;
    const form = koreanFormFactor(userAnswer, answer, keywords);
    if (expected.join("") === user.join("")) return Math.round(100 * form);

    const matched = matchTokens(expected, user);
    const recall = matched / expected.length;
    const precision = matched / user.length;

    const userCompact = user.join("");
    const keywordList = Array.isArray(keywords) ? keywords.filter(Boolean) : [];
    const keywordHits = keywordList.filter((keyword) => {
      const compact = compactKorean(keyword);
      return compact && userCompact.includes(compact);
    }).length;
    const keywordRatio = keywordList.length ? keywordHits / keywordList.length : recall;

    const raw = (keywordRatio * 35) + (recall * 45) + (precision * 20);
    return Math.max(0, Math.min(100, Math.round(raw * lengthPenalty(expected.length, user.length) * form)));
  }

  /** 영→한 해석 채점. data.answer 와 data.answers[] 중 가장 높은 점수 */
  function scoreKoreanTranslation(userAnswer, data) {
    if (!String(userAnswer || "").trim() || !data) return 0;
    const answers = [data.answer].concat(Array.isArray(data.answers) ? data.answers : [])
      .filter((answer) => typeof answer === "string" && answer.trim());
    return answers.reduce((best, answer) => (
      Math.max(best, scoreKoreanAgainst(userAnswer, answer, data.keywords))
    ), 0);
  }

  function normalizeEnglish(text) {
    return String(text || "")
      .toLowerCase()
      .replace(/[’']/g, "'")
      .replace(/[^a-z0-9'\s]/g, " ")
      .replace(/'/g, "")
      .replace(/\s+/g, " ")
      .trim();
  }

  // 관사·전치사·대명사·be동사: 내용어만 나열한 영작을 걸러 내는 데 쓴다.
  const EN_FUNCTION_WORDS = new Set([
    "a", "an", "the", "to", "for", "on", "in", "at", "of", "by", "with", "from", "into", "about",
    "is", "are", "was", "were", "be", "been", "am",
    "i", "we", "you", "he", "she", "they", "it", "my", "our", "your", "his", "her", "their", "its", "me", "us", "him", "them",
  ]);

  function countFunctionWordMatches(expectedTokens, userTokens) {
    const remaining = new Map();
    userTokens.forEach((token) => {
      if (EN_FUNCTION_WORDS.has(token)) remaining.set(token, (remaining.get(token) || 0) + 1);
    });
    let expectedCount = 0;
    let matched = 0;
    expectedTokens.forEach((token) => {
      if (!EN_FUNCTION_WORDS.has(token)) return;
      expectedCount += 1;
      if (remaining.get(token) > 0) {
        matched += 1;
        remaining.set(token, remaining.get(token) - 1);
      }
    });
    return { expectedCount, matched };
  }

  function scoreEnglishAgainst(userAnswer, correctAnswer) {
    const user = normalizeEnglish(userAnswer);
    const correct = normalizeEnglish(correctAnswer);
    if (!user || !correct) return 0;
    if (user === correct) return 100;
    const maxLength = Math.max(user.length, correct.length);
    const similarity = 1 - (levenshtein(user, correct) / maxLength);
    const expectedTokens = correct.split(" ");
    const userTokens = user.split(" ");
    const matched = matchTokens(expectedTokens, userTokens);
    const recall = matched / expectedTokens.length;
    const raw = (similarity * 55) + (recall * 45);
    const functionWords = countFunctionWordMatches(expectedTokens, userTokens);
    const form = formFactor(functionWords.expectedCount, functionWords.matched);
    return Math.max(0, Math.min(100, Math.round(raw * lengthPenalty(expectedTokens.length, userTokens.length) * form)));
  }

  /** 영→한 답안이 문장 형태 때문에 감점됐다면 이유 문구, 아니면 "" */
  function getKoreanFormHint(userAnswer, data) {
    if (!String(userAnswer || "").trim() || !data) return "";
    if (isKeywordListing(userAnswer, data.keywords)) {
      return "핵심어만 나열한 답은 문장으로 보지 않아 감점했습니다. 조사와 어미를 붙여 문장으로 써 보세요.";
    }
    const answers = [data.answer].concat(Array.isArray(data.answers) ? data.answers : [])
      .filter((answer) => typeof answer === "string" && answer.trim());
    const best = answers.reduce((max, answer) => Math.max(max, koreanParticleFactor(userAnswer, answer)), 0);
    return best < 1 ? "조사(은·는·을·를·에 등)가 빠져 감점했습니다." : "";
  }

  /** 한→영 답안이 관사·전치사 등이 빠져 감점됐다면 이유 문구, 아니면 "" */
  function getEnglishFormHint(userAnswer, data) {
    const source = typeof data === "string" ? { english: data } : (data || {});
    const user = normalizeEnglish(userAnswer);
    if (!user) return "";
    const answers = [source.english].concat(Array.isArray(source.englishAlternatives) ? source.englishAlternatives : [])
      .filter((answer) => typeof answer === "string" && answer.trim());
    const best = answers.reduce((max, answer) => {
      const fw = countFunctionWordMatches(normalizeEnglish(answer).split(" "), user.split(" "));
      return Math.max(max, formFactor(fw.expectedCount, fw.matched));
    }, 0);
    return best < 1 ? "관사·전치사·대명사(a, the, on, my 등)가 빠져 감점했습니다." : "";
  }

  /** 한→영 작문 채점. data.english 와 data.englishAlternatives[] 중 최고점 */
  function scoreEnglishSentence(userAnswer, data) {
    const source = typeof data === "string" ? { english: data } : (data || {});
    const answers = [source.english].concat(Array.isArray(source.englishAlternatives) ? source.englishAlternatives : [])
      .filter((answer) => typeof answer === "string" && answer.trim());
    return answers.reduce((best, answer) => Math.max(best, scoreEnglishAgainst(userAnswer, answer)), 0);
  }

  return {
    CURRENT_SCHEMA_VERSION,
    PASS_SCORE,
    DAILY_GOAL,
    REVIEW_INTERVAL_DAYS,
    DIFFICULTIES,
    DIFFICULTY_LABELS,
    TIME_PATTERN,
    toDayKey,
    startOfDay,
    addDays,
    normalizeDifficulty,
    getDifficultyLabel,
    getDefaultState,
    getDefaultSettings,
    normalizeSettings,
    migrateState,
    validateNickname,
    createProfile,
    getNextReviewDate,
    normalizeReviewList,
    findReviewItem,
    addReviewItem,
    updateReviewItem,
    removeReviewItem,
    getDueReviewItems,
    submitAnswer,
    countStudyDays,
    computeStreak,
    getTodaySummary,
    getLast7Days,
    getHeatmap,
    getStreakCalendar,
    getLatestEntry,
    getSentenceId,
    getSentencesForDifficulty,
    getDueSentences,
    pickNextNewSentence,
    pickRepeatSentence,
    pickPopupSentences,
    levenshtein,
    tokenizeKorean,
    scoreKoreanTranslation,
    scoreEnglishSentence,
    getKoreanFormHint,
    getEnglishFormHint,
  };
});
