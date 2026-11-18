const STATE_KEY = "mogugeo_state";
const CURRENT_SCHEMA_VERSION = 4;

function getDefaultState() {
  return {
    schemaVersion: 4,
    darkMode: false,
    onboardingSeen: false,
    streak: 0,
    lastStudyDate: null,
    lastPopupDate: null,
    sentenceIndex: 0,
    sentenceCorrect: 0,
    vocabIndex: 0,
    vocabCorrect: 0,
    totalStudyDays: 0,
    reviewList: [],
    studyLog: [],
    settings: {
      dailyPopupEnabled: true,
      popupTime: "08:30",
      autoStart: true,
      autoLogin: true,
      difficulty: "Intermediate",
      learningType: "Sentence + Vocabulary + Expressions",
    },
  };
}

function getDefaultSettings() {
  return { ...getDefaultState().settings };
}

function normalizeSettings(settings) {
  const defaults = getDefaultSettings();
  const source = settings && typeof settings === "object" && !Array.isArray(settings) ? settings : {};

  return {
    dailyPopupEnabled: typeof source.dailyPopupEnabled === "boolean"
      ? source.dailyPopupEnabled
      : defaults.dailyPopupEnabled,
    popupTime: typeof source.popupTime === "string" && source.popupTime.trim()
      ? source.popupTime
      : defaults.popupTime,
    autoStart: typeof source.autoStart === "boolean" ? source.autoStart : defaults.autoStart,
    autoLogin: typeof source.autoLogin === "boolean" ? source.autoLogin : defaults.autoLogin,
    difficulty: typeof source.difficulty === "string" && source.difficulty.trim()
      ? source.difficulty
      : defaults.difficulty,
    learningType: typeof source.learningType === "string" && source.learningType.trim()
      ? source.learningType
      : defaults.learningType,
  };
}

function migrateState(saved, fromVersion, toVersion) {
  if (!saved || typeof saved !== "object" || Array.isArray(saved)) {
    return getDefaultState();
  }

  if (fromVersion > toVersion) {
    return saved;
  }

  let migrated = saved;
  let currentVersion = fromVersion;

  if (currentVersion < 1) {
    migrated = Object.assign(getDefaultState(), saved, { schemaVersion: 1 });
    currentVersion = 1;
  }

  while (currentVersion < toVersion) {
    switch (currentVersion) {
      case 1:
        migrated = Object.assign({}, migrated, {
          reviewList: normalizeReviewList(migrated.reviewList),
          schemaVersion: 2,
        });
        currentVersion = 2;
        break;
      case 2:
        migrated = Object.assign({}, migrated, {
          studyLog: Array.isArray(migrated.studyLog) ? migrated.studyLog : [],
          schemaVersion: 3,
        });
        currentVersion = 3;
        break;
      case 3:
        migrated = Object.assign({}, migrated, {
          onboardingSeen: typeof migrated.onboardingSeen === "boolean" ? migrated.onboardingSeen : false,
          schemaVersion: 4,
        });
        currentVersion = 4;
        break;
      default:
        return migrated;
    }
  }

  return Object.assign(getDefaultState(), migrated, {
    schemaVersion: toVersion,
    settings: normalizeSettings(migrated.settings),
  });
}

function getState() {
  try {
    const saved = localStorage.getItem(STATE_KEY);
    if (!saved) return getDefaultState();
    const parsed = JSON.parse(saved);
    const savedSchemaVersion = Number.isInteger(parsed?.schemaVersion) ? parsed.schemaVersion : 0;

    if (savedSchemaVersion !== CURRENT_SCHEMA_VERSION) {
      const migrated = migrateState(parsed, savedSchemaVersion, CURRENT_SCHEMA_VERSION);

      if (migrated.schemaVersion === CURRENT_SCHEMA_VERSION) {
        saveState(migrated);
      }

      return migrated;
    }

    return Object.assign(getDefaultState(), parsed, {
      settings: normalizeSettings(parsed.settings),
      reviewList: normalizeReviewList(parsed.reviewList),
      studyLog: Array.isArray(parsed.studyLog) ? parsed.studyLog : [],
      onboardingSeen: typeof parsed.onboardingSeen === "boolean" ? parsed.onboardingSeen : false,
    });
  } catch {
    return getDefaultState();
  }
}

function saveState(state) {
  localStorage.setItem(STATE_KEY, JSON.stringify(state));
}

function getSentences() {
  return window.MoGugeoData?.sentences || [];
}

function getWords() {
  return window.MoGugeoData?.words || [];
}

function getExpressions() {
  return window.MoGugeoData?.expressions || [];
}

function getTodayReviewDate() {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  return date.toISOString();
}

function getNextReviewDate(level) {
  const reviewDays = [1, 3, 7, 30];
  const normalizedLevel = Math.max(0, Math.min(3, Number(level) || 0));
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() + reviewDays[normalizedLevel]);
  return date.toISOString();
}

function normalizeReviewList(reviewList) {
  if (!Array.isArray(reviewList)) return [];

  const seen = new Set();
  return reviewList.reduce((items, entry) => {
    let item = null;

    if (typeof entry === "string" && entry.trim()) {
      item = {
        contentId: entry,
        type: "sentence",
        level: 0,
        nextReviewAt: getTodayReviewDate(),
        lastReviewedAt: null,
      };
    } else if (entry && typeof entry === "object" && !Array.isArray(entry)) {
      const contentId = typeof entry.contentId === "string" ? entry.contentId.trim() : "";
      if (!contentId) return items;

      item = {
        contentId,
        type: entry.type === "sentence" ? "sentence" : "sentence",
        level: Math.max(0, Math.min(3, Number(entry.level) || 0)),
        nextReviewAt: typeof entry.nextReviewAt === "string" ? entry.nextReviewAt : getTodayReviewDate(),
        lastReviewedAt: typeof entry.lastReviewedAt === "string" ? entry.lastReviewedAt : null,
      };
    }

    if (!item || seen.has(item.contentId)) return items;

    seen.add(item.contentId);
    items.push(item);
    return items;
  }, []);
}

function addToReviewQueue(contentId, type, sourceState) {
  if (!contentId) return false;

  const state = sourceState || getState();
  if (state.reviewList.some((item) => item.contentId === contentId)) {
    return false;
  }

  state.reviewList.push({
    contentId,
    type: type === "sentence" ? "sentence" : "sentence",
    level: 0,
    nextReviewAt: getTodayReviewDate(),
    lastReviewedAt: null,
  });

  if (!sourceState) saveState(state);
  return true;
}

function updateReviewItem(contentId, isCorrect, sourceState) {
  const state = sourceState || getState();
  const item = state.reviewList.find((reviewItem) => reviewItem.contentId === contentId);
  if (!item) return false;

  item.lastReviewedAt = new Date().toISOString();
  if (isCorrect) {
    item.level = Math.min(item.level + 1, 3);
    item.nextReviewAt = getNextReviewDate(item.level);
  } else {
    item.level = 0;
    item.nextReviewAt = getTodayReviewDate();
  }

  if (!sourceState) saveState(state);
  return true;
}

function getDueReviewItems(sourceState) {
  const state = sourceState || getState();
  const now = Date.now();
  return state.reviewList.filter((item) => Date.parse(item.nextReviewAt) <= now);
}

function getSentenceContentId(data) {
  return data?.id || data?.english || "";
}

function getStudyLog(state) {
  if (!Array.isArray(state.studyLog)) {
    state.studyLog = [];
  }
  return state.studyLog;
}

function hasNoStudyData(state) {
  return state.totalStudyDays === 0 || getStudyLog(state).length === 0;
}

function createEmptyState(message, linkText = "문장 학습 시작", href = "sentence.html") {
  const empty = document.createElement("div");
  empty.className = "empty-state";

  const copy = document.createElement("p");
  copy.className = "empty-state-copy";
  copy.textContent = message;

  const link = document.createElement("a");
  link.className = "btn btn-soft empty-state-link";
  link.href = href;
  link.textContent = linkText;

  empty.append(copy, link);
  return empty;
}

function normalizeDifficulty(level) {
  return String(level || "").trim().toLowerCase();
}

function shuffleArray(items) {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function pickPopupSentences(state) {
  const sentences = getSentences();
  if (!sentences.length) return [];

  const selected = [];
  const selectedIds = new Set();
  const sentenceMap = new Map(
    sentences.map((sentence) => [getSentenceContentId(sentence), sentence])
  );

  function takeCandidates(candidates) {
    candidates.forEach((sentence) => {
      if (!sentence || selected.length >= 2) return;

      const contentId = getSentenceContentId(sentence);
      if (!contentId || selectedIds.has(contentId)) return;

      selected.push(sentence);
      selectedIds.add(contentId);
    });
  }

  const dueReviewSentences = getDueReviewItems(state)
    .filter((item) => item.type === "sentence")
    .map((item) => sentenceMap.get(item.contentId))
    .filter(Boolean);
  takeCandidates(dueReviewSentences);

  if (selected.length < 2) {
    const studiedSentenceIds = new Set(
      getStudyLog(state)
        .map((entry) => entry?.contentId)
        .filter(Boolean)
    );
    const targetDifficulty = normalizeDifficulty(state.settings?.difficulty);
    const unseenMatchingDifficulty = shuffleArray(
      sentences.filter((sentence) => {
        const contentId = getSentenceContentId(sentence);
        return (
          contentId &&
          !selectedIds.has(contentId) &&
          !studiedSentenceIds.has(contentId) &&
          normalizeDifficulty(sentence.level) === targetDifficulty
        );
      })
    );
    takeCandidates(unseenMatchingDifficulty);
  }

  if (selected.length < 2) {
    takeCandidates(
      shuffleArray(
        sentences.filter((sentence) => !selectedIds.has(getSentenceContentId(sentence)))
      )
    );
  }

  return selected;
}

function $(selector) {
  return document.querySelector(selector);
}

function speakText(text, lang = "en-US") {
  const content = String(text || "").trim();
  if (!content) return;

  if (!window.speechSynthesis || typeof window.SpeechSynthesisUtterance === "undefined") {
    console.warn("Speech synthesis is unavailable in this environment.");
    return;
  }

  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(content);
  utterance.lang = lang;
  window.speechSynthesis.speak(utterance);
}

const TOKEN_ENDINGS = ["입니다", "합니다", "있어요", "해요", "이다", "은", "는", "이", "가", "을", "를"];

function levenshtein(a, b) {
  const rows = a.length + 1;
  const cols = b.length + 1;
  const dp = Array.from({ length: rows }, () => Array(cols).fill(0));

  for (let i = 0; i < rows; i += 1) dp[i][0] = i;
  for (let j = 0; j < cols; j += 1) dp[0][j] = j;

  for (let i = 1; i < rows; i += 1) {
    for (let j = 1; j < cols; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(
        dp[i - 1][j] + 1,
        dp[i][j - 1] + 1,
        dp[i - 1][j - 1] + cost
      );
    }
  }

  return dp[a.length][b.length];
}

function stripTokenEnding(token) {
  let normalized = token;

  TOKEN_ENDINGS.forEach((ending) => {
    if (normalized.length > ending.length && normalized.endsWith(ending)) {
      normalized = normalized.slice(0, -ending.length);
    }
  });

  return normalized;
}

function normalizeToken(token) {
  return stripTokenEnding(token.toLowerCase().replace(/^[^0-9a-zA-Z가-힣]+|[^0-9a-zA-Z가-힣]+$/g, ""));
}

function tokenizeText(text) {
  return text
    .split(/\s+/)
    .map((token) => normalizeToken(token))
    .filter(Boolean);
}

function getTokenSimilarityScore(userAnswer, correctAnswer) {
  const expectedTokens = tokenizeText(correctAnswer);
  const userTokens = tokenizeText(userAnswer);

  if (!expectedTokens.length || !userTokens.length) {
    return { ratio: 0, exactMatchBonus: 0 };
  }

  const usedUserTokenIndexes = new Set();
  let matchedCount = 0;
  let hasExactMatch = false;

  expectedTokens.forEach((expectedToken) => {
    for (let i = 0; i < userTokens.length; i += 1) {
      if (usedUserTokenIndexes.has(i)) continue;

      const userToken = userTokens[i];
      if (userToken === expectedToken) {
        usedUserTokenIndexes.add(i);
        matchedCount += 1;
        hasExactMatch = true;
        return;
      }

      const maxLength = Math.max(expectedToken.length, userToken.length);
      const threshold = Math.ceil(maxLength * 0.2);
      if (levenshtein(expectedToken, userToken) <= threshold) {
        usedUserTokenIndexes.add(i);
        matchedCount += 1;
        return;
      }
    }
  });

  return {
    ratio: matchedCount / expectedTokens.length,
    exactMatchBonus: hasExactMatch ? 10 : 0,
  };
}

function normalizeEnglishSentence(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function scoreEnglishSentence(userAnswer, correctAnswer) {
  const normalizedUser = normalizeEnglishSentence(userAnswer);
  const normalizedCorrect = normalizeEnglishSentence(correctAnswer);

  if (!normalizedUser || !normalizedCorrect) return 0;
  if (normalizedUser === normalizedCorrect) return 100;

  const maxLength = Math.max(normalizedUser.length, normalizedCorrect.length);
  const distance = levenshtein(normalizedUser, normalizedCorrect);
  const similarityRatio = maxLength > 0 ? 1 - (distance / maxLength) : 0;
  const tokenScore = getTokenSimilarityScore(normalizedUser, normalizedCorrect);
  const totalScore = (similarityRatio * 55) + (tokenScore.ratio * 45);
  return Math.max(0, Math.min(100, Math.round(totalScore)));
}

function updateStreak(state) {
  const today = new Date().toDateString();
  if (state.lastStudyDate === today) return;

  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);

  if (state.lastStudyDate === yesterday.toDateString()) {
    state.streak += 1;
  } else {
    state.streak = 1;
  }

  state.lastStudyDate = today;
  state.totalStudyDays += 1;
  saveState(state);
}

function scoreSentence(userAnswer, data) {
  if (!userAnswer.trim()) return 0;
  const keywords = Array.isArray(data.keywords) ? data.keywords : [];
  const matchedKeywords = keywords.filter((kw) => userAnswer.includes(kw));
  const keywordRatio = keywords.length ? matchedKeywords.length / keywords.length : 0;
  const tokenScore = getTokenSimilarityScore(userAnswer, data.answer || "");
  const totalScore = (keywordRatio * 40) + (tokenScore.ratio * 60) + tokenScore.exactMatchBonus;
  return Math.min(100, Math.round(totalScore));
}

function checkVocabAnswer(userAnswer, correctMeaning) {
  const answers = correctMeaning.split(",").map((s) => s.trim());
  const input = userAnswer.trim();
  if (!input) return false;
  return answers.some((answer) => input === answer || (input.length >= 2 && answer.includes(input)));
}

function applyDarkMode(enabled) {
  document.body.classList.toggle("dark", enabled);
}

function initDarkMode(state) {
  applyDarkMode(state.darkMode);
}

function initSwitches() {
  document.querySelectorAll('button.switch[role="switch"]').forEach((sw) => {
    sw.addEventListener("click", () => {
      const isOn = sw.classList.toggle("on");
      sw.setAttribute("aria-checked", String(isOn));
      sw.dispatchEvent(new CustomEvent("switch-change", { detail: { on: isOn } }));
    });

    sw.addEventListener("keydown", (event) => {
      if (event.key === " " || event.key === "Enter") {
        event.preventDefault();
        sw.click();
      }
    });
  });
}

function initLogin() {
  const form = $("[data-login-form]");
  if (!form) return;

  const usernameInput = $("#username") || $("#email");
  const passwordInput = $("#password");

  form.addEventListener("submit", (event) => {
    event.preventDefault();

    if (!usernameInput?.value.trim()) {
      if (usernameInput) {
        usernameInput.focus();
        usernameInput.style.borderColor = "#e53935";
      }
      return;
    }

    if (!passwordInput?.value.trim()) {
      if (passwordInput) {
        passwordInput.focus();
        passwordInput.style.borderColor = "#e53935";
      }
      return;
    }

    // P2: integrate Supabase Auth here.
    if (window.mogugeo?.expandWindow) {
      window.mogugeo.expandWindow();
      return;
    }

    window.location.href = "dashboard.html";
  });

  [usernameInput, passwordInput].forEach((input) => {
    if (!input) return;
    input.addEventListener("input", () => {
      input.style.borderColor = "";
    });
  });
}

function setFieldInvalid(field, firstInvalidRef) {
  if (!field) return firstInvalidRef;
  field.style.borderColor = "#e53935";
  return firstInvalidRef || field;
}

function resetFieldValidation(field) {
  if (!field) return;
  field.style.borderColor = "";
}

function isValidSignupUsername(value) {
  return /^[A-Za-z0-9_]{4,20}$/.test(value);
}

function isValidSignupEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function isValidSignupPhone(value) {
  return /^[0-9-]+$/.test(value);
}

function initSignup() {
  const form = $("[data-signup-form]");
  if (!form) return;

  const usernameInput = $("#signup-username");
  const passwordInput = $("#signup-password");
  const passwordConfirmInput = $("#signup-password-confirm");
  const nicknameInput = $("#signup-nickname");
  const emailInput = $("#signup-email");
  const phoneInput = $("#signup-phone");
  const carrierInput = $("#signup-carrier");
  const agreeInput = $("#signup-agree");

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const username = usernameInput?.value.trim() || "";
    const password = passwordInput?.value || "";
    const passwordConfirm = passwordConfirmInput?.value || "";
    const nickname = nicknameInput?.value.trim() || "";
    const email = emailInput?.value.trim() || "";
    const phone = phoneInput?.value.trim() || "";
    let firstInvalidField = null;

    [
      usernameInput,
      passwordInput,
      passwordConfirmInput,
      nicknameInput,
      emailInput,
      phoneInput,
      carrierInput,
      agreeInput,
    ].forEach(resetFieldValidation);

    if (!isValidSignupUsername(username)) {
      firstInvalidField = setFieldInvalid(usernameInput, firstInvalidField);
    }

    if (password.length < 8) {
      firstInvalidField = setFieldInvalid(passwordInput, firstInvalidField);
    }

    if (!passwordConfirm || passwordConfirm !== password) {
      firstInvalidField = setFieldInvalid(passwordConfirmInput, firstInvalidField);
    }

    if (nickname.length < 2 || nickname.length > 16) {
      firstInvalidField = setFieldInvalid(nicknameInput, firstInvalidField);
    }

    if (email && !isValidSignupEmail(email)) {
      firstInvalidField = setFieldInvalid(emailInput, firstInvalidField);
    }

    if (phone && !isValidSignupPhone(phone)) {
      firstInvalidField = setFieldInvalid(phoneInput, firstInvalidField);
    }

    if (!agreeInput?.checked) {
      firstInvalidField = setFieldInvalid(agreeInput, firstInvalidField);
    }

    if (firstInvalidField) {
      firstInvalidField.focus();
      return;
    }

    // P2: integrate Supabase Auth here after client-side validation succeeds.
    if (window.mogugeo?.expandWindow) {
      window.mogugeo.expandWindow();
      return;
    }

    window.location.href = "dashboard.html";
  });

  form.querySelectorAll(".text-input").forEach((input) => {
    input.addEventListener("input", () => {
      resetFieldValidation(input);
    });
  });

  if (agreeInput) {
    agreeInput.addEventListener("change", () => {
      resetFieldValidation(agreeInput);
    });
  }
}

function initOnboarding() {
  const stage = document.querySelector(".onboarding-stage");
  if (!stage) return;

  const steps = Array.from(document.querySelectorAll(".onboarding-step"));
  const dots = Array.from(document.querySelectorAll(".onboarding-dot"));
  const prevBtn = $("#onboarding-prev");
  const nextBtn = $("#onboarding-next");
  const startBtn = $("#onboarding-start");
  let currentStep = 0;

  function renderStep(index) {
    currentStep = index;

    steps.forEach((step, stepIndex) => {
      const isActive = stepIndex === currentStep;
      step.hidden = !isActive;
      step.classList.toggle("active", isActive);
    });

    dots.forEach((dot, dotIndex) => {
      const isActive = dotIndex === currentStep;
      dot.classList.toggle("active", isActive);
      dot.setAttribute("aria-current", isActive ? "step" : "false");
    });

    if (prevBtn) prevBtn.disabled = currentStep === 0;
    if (nextBtn) nextBtn.hidden = currentStep === steps.length - 1;
    if (startBtn) startBtn.hidden = currentStep !== steps.length - 1;
  }

  if (prevBtn) {
    prevBtn.addEventListener("click", () => {
      renderStep(Math.max(0, currentStep - 1));
    });
  }

  if (nextBtn) {
    nextBtn.addEventListener("click", () => {
      renderStep(Math.min(steps.length - 1, currentStep + 1));
    });
  }

  if (startBtn) {
    startBtn.addEventListener("click", () => {
      const state = getState();
      state.onboardingSeen = true;
      saveState(state);
      window.location.href = "dashboard.html";
    });
  }

  renderStep(0);
}

function initDashboard() {
  if (!$("#dash-progress-text")) return;
  const state = getState();
  if (state.onboardingSeen === false) {
    window.location.href = "onboarding.html";
    return;
  }
  const isEmpty = hasNoStudyData(state);
  const heroTitle = document.querySelector(".hero-title");
  const heroCopy = document.querySelector(".hero-copy");
  const feedbackCard = document.querySelector(".feedback-card");
  const feedbackCopy = document.querySelector(".feedback-card .section-title");
  const feedbackLink = document.querySelector(".feedback-card .link-action");
  const streakGrid = document.querySelector(".streak-grid");

  const totalDone = state.sentenceCorrect + state.vocabCorrect;
  const totalGoal = 5;
  const pct = Math.min(100, Math.round((totalDone / totalGoal) * 100));

  if (heroTitle && isEmpty) {
    heroTitle.innerHTML = "학습 기록이 없어요";
  }
  if (heroCopy) {
    heroCopy.textContent = isEmpty
      ? "첫 학습을 시작해보세요"
      : "오늘도 한 걸음씩 목표를 채워 보세요.";
  }

  $("#dash-progress-text").textContent = isEmpty ? "0 / 5" : `${totalDone} / ${totalGoal}`;
  const bar = $("#dash-progress-bar");
  if (bar) bar.style.width = isEmpty ? "0%" : `${pct}%`;

  const streakEl = $("#dash-streak");
  if (streakEl) streakEl.textContent = `${isEmpty ? 0 : state.streak} days`;

  const remaining = Math.max(0, totalGoal - totalDone);
  const remainEl = $("#dash-remaining");
  if (remainEl) {
    remainEl.textContent = isEmpty
      ? "아직 학습 기록이 없습니다"
      : `${remaining} more items to reach today's goal`;
  }

  if (feedbackCard && feedbackCopy && feedbackLink && isEmpty) {
    feedbackCopy.textContent = "학습을 시작하면 피드백이 표시됩니다.";
    feedbackLink.href = "sentence.html";
    feedbackLink.innerHTML = '문장 학습 시작 <span class="material-symbols-outlined">arrow_forward</span>';
  }

  if (streakGrid && isEmpty) {
    const labels = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
    streakGrid.innerHTML = labels
      .map((label) => `<div class="streak-head">${label}</div>`)
      .concat(Array.from({ length: 14 }, (_, index) => `<div class="streak-day pending">${index + 1}</div>`))
      .join("");
  }
}

function initSentence() {
  const textEl = $("#sentence-text");
  if (!textEl) return;

  const sentences = getSentences();
  if (!sentences.length) {
    textEl.textContent = "Sentence data is unavailable.";
    return;
  }

  const state = getState();
  let idx = state.sentenceIndex % sentences.length;
  let answered = false;
  const reviewBtn = $("#btn-add-review");
  const playAudioBtn = $("#btn-play-audio");
  let currentSentence = sentences[idx];

  function getSentenceContentId(data) {
    return data.id || data.english;
  }

  function syncReviewButton(data) {
    if (!reviewBtn) return;

    const contentId = getSentenceContentId(data);
    const isQueued = state.reviewList.some((item) => item.contentId === contentId);
    reviewBtn.textContent = isQueued ? "Added" : "Add to review list";
    reviewBtn.disabled = isQueued;
  }

  function loadSentence() {
    const data = sentences[idx];
    currentSentence = data;
    textEl.textContent = data.english;
    const textarea = $("#translation");
    if (textarea) textarea.value = "";
    answered = false;

    const feedback = $("#feedback-section");
    if (feedback) feedback.style.display = "none";

    const progressText = $("#sentence-progress-text");
    if (progressText) progressText.textContent = `${state.sentenceCorrect} / ${sentences.length} sentences`;

    const progressBar = $("#sentence-progress-bar");
    if (progressBar) {
      progressBar.style.width = `${Math.round((state.sentenceCorrect / sentences.length) * 100)}%`;
    }

    syncReviewButton(data);
  }

  loadSentence();

  const checkBtn = $("#btn-check-sentence");
  if (checkBtn) {
    checkBtn.addEventListener("click", () => {
      if (answered) return;
      const textarea = $("#translation");
      if (!textarea || !textarea.value.trim()) {
        if (textarea) {
          textarea.focus();
          textarea.style.borderColor = "#e53935";
        }
        return;
      }

      answered = true;
      const data = sentences[idx];
      const score = scoreSentence(textarea.value, data);

      const feedback = $("#feedback-section");
      if (feedback) feedback.style.display = "block";

      const answerBox = feedback?.querySelector(".answer-box .section-copy");
      if (answerBox) answerBox.textContent = data.answer;

      const tipBox = feedback?.querySelector(".tip-box .section-copy");
      if (tipBox) tipBox.textContent = data.tip;

      const grammarBox = feedback?.querySelector(".explain-box > div:first-child .section-copy");
      if (grammarBox) grammarBox.textContent = data.grammar;

      const extraBox = feedback?.querySelector(".explain-box > div:last-child .section-copy");
      if (extraBox) extraBox.textContent = data.extra;

      if (score >= 60) {
        state.sentenceCorrect += 1;
        addToReviewQueue(getSentenceContentId(data), "sentence", state);
        textarea.style.borderColor = "#43a047";
      } else {
        textarea.style.borderColor = "#e53935";
      }

      updateStreak(state);
      saveState(state);
      syncReviewButton(data);
    });
  }

  const nextBtn = $("#btn-next-sentence");
  if (nextBtn) {
    nextBtn.addEventListener("click", () => {
      idx = (idx + 1) % sentences.length;
      state.sentenceIndex = idx;
      saveState(state);
      loadSentence();
    });
  }

  if (reviewBtn) {
    reviewBtn.addEventListener("click", () => {
      const data = sentences[idx];
      if (addToReviewQueue(getSentenceContentId(data), "sentence", state)) {
        saveState(state);
      }
      syncReviewButton(data);
    });
  }

  if (playAudioBtn) {
    playAudioBtn.addEventListener("click", () => {
      speakText(currentSentence?.english, "en-US");
    });
  }

  const textarea = $("#translation");
  if (textarea) {
    textarea.addEventListener("input", () => {
      textarea.style.borderColor = "";
    });
  }
}

function initVocabulary() {
  const wordEl = $("#vocab-word");
  if (!wordEl) return;

  const words = getWords();
  if (!words.length) {
    wordEl.textContent = "Vocabulary data is unavailable.";
    return;
  }

  const state = getState();
  let idx = state.vocabIndex % words.length;
  let answered = false;

  function loadWord() {
    const data = words[idx];
    wordEl.textContent = data.word;
    const input = $("#vocab-answer");
    if (input) input.value = "";
    answered = false;

    const result = $("#vocab-result");
    if (result) result.style.display = "none";

    const panel = $("#vocab-info-panel");
    if (panel) panel.style.visibility = "hidden";

    const total = state.vocabIndex;
    const correct = state.vocabCorrect;

    const progress = $("#vocab-progress");
    if (progress) progress.textContent = `${total} / ${words.length} words`;

    const bar = $("#vocab-progress-bar");
    if (bar) bar.style.width = `${Math.round((total / words.length) * 100)}%`;

    const accuracy = $("#vocab-accuracy");
    if (accuracy) {
      const pct = total > 0 ? Math.round((correct / total) * 100) : 0;
      accuracy.textContent = `Accuracy ${pct}%`;
    }
  }

  loadWord();

  const checkBtn = $("#vocab-check");
  if (checkBtn) {
    checkBtn.addEventListener("click", () => {
      if (answered) return;
      const input = $("#vocab-answer");
      if (!input || !input.value.trim()) {
        if (input) {
          input.focus();
          input.style.borderColor = "#e53935";
        }
        return;
      }

      answered = true;
      const data = words[idx];
      const isCorrect = checkVocabAnswer(input.value, data.meaning);

      if (isCorrect) {
        state.vocabCorrect += 1;
        input.style.borderColor = "#43a047";
      } else {
        input.style.borderColor = "#e53935";
      }

      const result = $("#vocab-result");
      if (result) {
        result.style.display = "block";
        result.style.padding = "12px 16px";
        result.style.borderRadius = "8px";
        result.style.fontWeight = "600";
        if (isCorrect) {
          result.textContent = "Correct";
          result.className = "spacer-top vocab-result-correct";
        } else {
          result.textContent = `Not quite. Meaning: ${data.meaning}`;
          result.className = "spacer-top vocab-result-wrong";
        }
      }

      const panel = $("#vocab-info-panel");
      if (panel) panel.style.visibility = "visible";

      $("#vocab-pron").textContent = data.pronunciation;
      $("#vocab-example").textContent = data.example;
      $("#vocab-meaning").textContent = data.meaning;
      $("#vocab-related").textContent = data.related;

      const nextTotal = state.vocabIndex + 1;
      const progress = $("#vocab-progress");
      if (progress) progress.textContent = `${nextTotal} / ${words.length} words`;

      const bar = $("#vocab-progress-bar");
      if (bar) bar.style.width = `${Math.round((nextTotal / words.length) * 100)}%`;

      const accuracy = $("#vocab-accuracy");
      if (accuracy) {
        accuracy.textContent = `Accuracy ${Math.round((state.vocabCorrect / nextTotal) * 100)}%`;
      }

      updateStreak(state);
      saveState(state);
    });
  }

  const nextBtn = $("#vocab-next");
  if (nextBtn) {
    nextBtn.addEventListener("click", () => {
      idx = (idx + 1) % words.length;
      state.vocabIndex = idx;
      saveState(state);
      loadWord();
    });
  }

  const input = $("#vocab-answer");
  if (input) {
    input.addEventListener("input", () => {
      input.style.borderColor = "";
    });
    input.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        if (!answered && checkBtn) checkBtn.click();
      }
    });
  }
}

function initExpressions() {
  const grid = $("#expressions-grid");
  if (!grid) return;

  const expressions = getExpressions();
  if (!expressions.length) {
    grid.innerHTML = '<div class="list-item"><div><strong>No data</strong><p class="small muted">Expressions data is unavailable.</p></div></div>';
    return;
  }

  grid.innerHTML = expressions
    .map(
      (item) => `
        <div class="list-item" style="align-items: flex-start;">
          <div>
            <strong>${item.expression}</strong>
            <p class="small muted">${item.korean}</p>
            <p class="small muted">${item.example}</p>
            <p class="small muted">${item.context}</p>
            <p class="small muted">${item.note}</p>
          </div>
          <span class="chip">${item.category}</span>
        </div>
      `,
    )
    .join("");
}

function initMyPage() {
  const nameEl = $("#profile-name");
  if (!nameEl) return;

  const state = getState();
  const isEmpty = hasNoStudyData(state);

  const daysEl = $("#total-days");
  if (daysEl) daysEl.textContent = `Total study days ${state.totalStudyDays}`;

  const streakEl = $("#streak-chip");
  if (streakEl) streakEl.textContent = `${state.streak} day streak`;

  if (isEmpty) {
    const chartArea = document.querySelector(".chart-area");
    const heatmap = document.querySelector(".heatmap");

    if (chartArea) {
      chartArea.replaceChildren(
        createEmptyState("아직 학습 데이터가 없습니다. 첫 학습을 시작해보세요")
      );
    }

    if (heatmap) {
      heatmap.replaceChildren(
        createEmptyState("아직 학습 데이터가 없습니다. 첫 학습을 시작해보세요")
      );
    }
  }

  const darkToggle = $("#dark-mode-toggle");
  if (darkToggle) {
    if (state.darkMode) {
      darkToggle.classList.add("on");
      darkToggle.setAttribute("aria-checked", "true");
    }
    darkToggle.addEventListener("switch-change", (event) => {
      state.darkMode = event.detail.on;
      applyDarkMode(state.darkMode);
      saveState(state);
    });
  }

  initReviewNote();
}

function initReviewNote() {
  const container = $("#review-list-container");
  if (!container) return;

  const countEl = $("#review-list-count");
  const state = getState();
  const sentenceMap = new Map(
    getSentences().map((sentence) => [sentence.id || sentence.english, sentence])
  );

  function formatReviewDate(isoDate) {
    const time = Date.parse(isoDate);
    if (Number.isNaN(time)) return "날짜 정보 없음";
    return new Date(time).toLocaleDateString("ko-KR");
  }

  function render() {
    const dueItems = getDueReviewItems(state);

    if (countEl) {
      countEl.textContent = `대기 중 ${dueItems.length}개`;
    }

    container.replaceChildren();

    if (!dueItems.length) {
      const empty = document.createElement("p");
      empty.className = "muted";
      empty.textContent = "복습할 항목이 없습니다";
      container.appendChild(empty);
      return;
    }

    const list = document.createElement("div");
    list.className = "list-stack";

    dueItems.forEach((item) => {
      const row = document.createElement("div");
      row.className = "list-item";

      const content = document.createElement("div");
      content.style.flex = "1";
      content.style.minWidth = "0";

      const sentence = sentenceMap.get(item.contentId);
      const title = document.createElement("strong");
      title.textContent = sentence?.english || item.contentId;

      const meta = document.createElement("p");
      meta.className = "fine-copy small";
      meta.style.margin = "8px 0 0";
      meta.textContent = `다음 복습 ${formatReviewDate(item.nextReviewAt)}`;

      const removeBtn = document.createElement("button");
      removeBtn.type = "button";
      removeBtn.className = "link-action";
      removeBtn.textContent = "지우기";
      removeBtn.addEventListener("click", () => {
        state.reviewList = state.reviewList.filter((reviewItem) => reviewItem.contentId !== item.contentId);
        saveState(state);
        render();
      });

      content.append(title, meta);
      row.append(content, removeBtn);
      list.appendChild(row);
    });

    container.appendChild(list);
  }

  render();
}

function setSwitchState(element, enabled) {
  if (!element) return;
  element.classList.toggle("on", enabled);
  element.setAttribute("aria-checked", String(enabled));
}

async function syncDailyPopupSetting(state) {
  await window.mogugeo?.setDailyPopup?.(
    state.settings.dailyPopupEnabled,
    state.settings.popupTime,
  );
}

async function syncAutoStartSetting(state) {
  await window.mogugeo?.setAutoStart?.(state.settings.autoStart);
}

async function initSettings() {
  const timeInput = $("#popup-time");
  if (!timeInput) return;

  const state = getState();
  const diffSelect = $("#difficulty");
  const typeSelect = $("#learning-type");
  const dailyPopupToggle = $("#daily-popup-toggle");
  const autoStartToggle = $("#auto-start-toggle");
  const autoLoginToggle = $("#auto-login-toggle");
  const darkToggle = $("#dark-mode-toggle");
  const reportIssueButton = $("#btn-report-issue");

  try {
    const autoStartEnabled = await window.mogugeo?.getAutoStart?.();
    if (typeof autoStartEnabled === "boolean") {
      state.settings.autoStart = autoStartEnabled;
    }

    const dailyPopup = await window.mogugeo?.getDailyPopup?.();
    if (typeof dailyPopup?.enabled === "boolean") {
      state.settings.dailyPopupEnabled = dailyPopup.enabled;
    }
    if (typeof dailyPopup?.time === "string" && dailyPopup.time.trim()) {
      state.settings.popupTime = dailyPopup.time;
    }
  } catch (error) {
    console.warn("Failed to sync settings state from the OS.", error);
  }

  timeInput.value = state.settings.popupTime;
  if (diffSelect) diffSelect.value = state.settings.difficulty;
  if (typeSelect) typeSelect.value = state.settings.learningType;
  setSwitchState(dailyPopupToggle, state.settings.dailyPopupEnabled);
  setSwitchState(autoStartToggle, state.settings.autoStart);
  setSwitchState(autoLoginToggle, state.settings.autoLogin);
  setSwitchState(darkToggle, state.darkMode);
  saveState(state);

  [timeInput, diffSelect, typeSelect].forEach((element) => {
    if (!element) return;
    element.addEventListener("change", async () => {
      state.settings.popupTime = timeInput.value;
      if (diffSelect) state.settings.difficulty = diffSelect.value;
      if (typeSelect) state.settings.learningType = typeSelect.value;
      saveState(state);
      await syncDailyPopupSetting(state);
    });
  });

  if (dailyPopupToggle) {
    dailyPopupToggle.addEventListener("switch-change", async (event) => {
      state.settings.dailyPopupEnabled = event.detail.on;
      saveState(state);
      await syncDailyPopupSetting(state);
    });
  }

  if (autoStartToggle) {
    autoStartToggle.addEventListener("switch-change", async (event) => {
      state.settings.autoStart = event.detail.on;
      saveState(state);
      await syncAutoStartSetting(state);
    });
  }

  if (autoLoginToggle) {
    autoLoginToggle.addEventListener("switch-change", (event) => {
      state.settings.autoLogin = event.detail.on;
      saveState(state);
    });
  }

  if (darkToggle) {
    darkToggle.addEventListener("switch-change", (event) => {
      state.darkMode = event.detail.on;
      applyDarkMode(state.darkMode);
      saveState(state);
    });
  }

  if (reportIssueButton) {
    reportIssueButton.addEventListener("click", () => {
      window.mogugeo?.openExternal?.("https://github.com/BrandonLotusKim/MoGugeo/issues");
      // Replace with the actual repo URL if the Issues path changes.
    });
  }
}

function recordStudyLog(state, entry) {
  getStudyLog(state).push(entry);
}

function syncPopupReviewState(state, contentId, isCorrect) {
  if (!contentId) return;

  const hasExistingItem = state.reviewList.some((item) => item.contentId === contentId);
  if (hasExistingItem) {
    updateReviewItem(contentId, isCorrect, state);
    return;
  }

  addToReviewQueue(contentId, "sentence", state);
}

function initPopup() {
  const checkBtn = $("#popup-check");
  if (!checkBtn) return;

  const state = getState();
  const heroCopy = $("#popup-hero-copy");
  const messageEl = $("#popup-message");
  const resultEl = $("#popup-result");
  const taskStack = $("#popup-task-stack");
  const taskOne = $("#popup-task-1");
  const taskTwo = $("#popup-task-2");
  const questionOne = $("#popup-question-1");
  const questionTwo = $("#popup-question-2");
  const inputOne = $("#popup-answer-1");
  const inputTwo = $("#popup-answer-2");
  const today = new Date().toDateString();

  function setPopupMessage(message, color) {
    if (!messageEl) return;
    messageEl.textContent = message;
    messageEl.style.color = color || "";
  }

  function disablePopupForm(message) {
    [inputOne, inputTwo].forEach((input) => {
      if (!input) return;
      input.disabled = true;
    });
    checkBtn.disabled = true;
    checkBtn.style.opacity = "0.6";
    if (message) setPopupMessage(message);
  }

  if (state.lastPopupDate === today) {
    if (heroCopy) heroCopy.textContent = "Today's popup study is already complete.";
    if (taskStack) taskStack.style.display = "none";
    if (resultEl) resultEl.hidden = true;
    disablePopupForm("Come back tomorrow for a new popup set.");
    return;
  }

  const popupSentences = pickPopupSentences(state);
  const taskConfigs = [
    {
      sentence: popupSentences[0],
      input: inputOne,
      card: taskOne,
      question: questionOne,
      direction: "en-to-ko",
    },
    {
      sentence: popupSentences[1],
      input: inputTwo,
      card: taskTwo,
      question: questionTwo,
      direction: "ko-to-en",
    },
  ];
  const activeTasks = taskConfigs.filter((task) => task.sentence);

  if (!activeTasks.length) {
    if (heroCopy) heroCopy.textContent = "Sentence data is unavailable.";
    if (taskStack) taskStack.style.display = "none";
    disablePopupForm("Unable to load popup questions.");
    return;
  }

  taskConfigs.forEach((task) => {
    if (!task.card) return;

    if (!task.sentence) {
      task.card.style.display = "none";
      return;
    }

    task.card.style.display = "";
    if (task.question) {
      task.question.textContent = task.direction === "en-to-ko"
        ? task.sentence.english
        : (task.sentence.answer || "");
    }

    if (task.input) {
      task.input.value = "";
      task.input.disabled = false;
      task.input.style.borderColor = "";
      task.input.placeholder = task.direction === "en-to-ko"
        ? "Enter the Korean meaning."
        : "Enter the English sentence.";
    }
  });

  checkBtn.addEventListener("click", () => {
    let allFilled = true;

    activeTasks.forEach((task) => {
      if (task.input && !task.input.value.trim()) {
        task.input.style.borderColor = "#e53935";
        allFilled = false;
      }
    });

    if (!allFilled) {
      setPopupMessage("Fill in every visible answer before grading.", "#e53935");
      return;
    }

    const completedAt = new Date().toISOString();
    const resultItems = [];

    activeTasks.forEach((task, index) => {
      const score = task.direction === "en-to-ko"
        ? scoreSentence(task.input.value, task.sentence)
        : scoreEnglishSentence(task.input.value, task.sentence.english);
      const isCorrect = score >= 60;
      const contentId = getSentenceContentId(task.sentence);
      const correctAnswer = task.direction === "en-to-ko" ? task.sentence.answer : task.sentence.english;

      task.input.style.borderColor = isCorrect ? "#43a047" : "#e53935";
      recordStudyLog(state, {
        date: completedAt,
        contentId,
        direction: task.direction,
        score,
        isCorrect,
      });
      syncPopupReviewState(state, contentId, isCorrect);

      resultItems.push({
        index,
        score,
        isCorrect,
        correctAnswer,
      });
    });

    resultItems.forEach((item) => {
      const statusEl = $(`#popup-result-${item.index + 1}-status`);
      const answerEl = $(`#popup-result-${item.index + 1}-answer`);
      const scoreEl = $(`#popup-result-${item.index + 1}-score`);
      const rowEl = $(`#popup-result-item-${item.index + 1}`);

      if (rowEl) rowEl.style.display = "";
      if (statusEl) {
        statusEl.textContent = item.isCorrect
          ? `Task ${item.index + 1}: Correct`
          : `Task ${item.index + 1}: Review needed`;
      }
      if (answerEl) {
        answerEl.textContent = `Model answer: ${item.correctAnswer || "N/A"}`;
      }
      if (scoreEl) {
        scoreEl.textContent = `${item.score}`;
      }
    });

    if (resultEl) {
      resultEl.hidden = false;
    }

    if (activeTasks.length < taskConfigs.length) {
      const hiddenResultRow = $("#popup-result-item-2");
      if (hiddenResultRow && activeTasks.length === 1) {
        hiddenResultRow.style.display = "none";
      }
    }

    state.lastPopupDate = today;
    updateStreak(state);
    saveState(state);

    checkBtn.textContent = "Done";
    checkBtn.disabled = true;
    checkBtn.style.opacity = "0.6";
    activeTasks.forEach((task) => {
      if (task.input) task.input.disabled = true;
    });
    if (heroCopy) heroCopy.textContent = "Today's popup study is complete.";
    setPopupMessage("Results saved. Review items and streak have been updated.", "#43a047");
  });

  [inputOne, inputTwo].forEach((input) => {
    if (!input) return;
    input.addEventListener("input", () => {
      input.style.borderColor = "";
      setPopupMessage("");
    });
    input.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        if (!checkBtn.disabled) checkBtn.click();
      }
    });
  });
}

function initDemoActions() {
  document.querySelectorAll("[data-demo-action]").forEach((btn) => {
    btn.addEventListener("click", () => {
      window.alert("This demo action is not implemented yet.");
    });
  });
}

function initSlideMenu() {
  const btnOpen = $("#btn-menu-open");
  const btnClose = $("#btn-menu-close");
  const overlay = $("#menu-overlay");
  const menu = $("#slide-menu");
  if (!btnOpen || !menu) return;

  function openMenu() {
    menu.classList.add("open");
    if (overlay) overlay.classList.add("open");
  }

  function closeMenu() {
    menu.classList.remove("open");
    if (overlay) overlay.classList.remove("open");
  }

  btnOpen.addEventListener("click", openMenu);
  if (btnClose) btnClose.addEventListener("click", closeMenu);
  if (overlay) overlay.addEventListener("click", closeMenu);

  document.querySelectorAll("#btn-logout, [data-logout-link]").forEach((btnLogout) => {
    btnLogout.addEventListener("click", (event) => {
      event.preventDefault();
      if (window.mogugeo?.shrinkWindow) {
        window.mogugeo.shrinkWindow();
        return;
      }

      window.location.href = "main.html";
    });
  });
}

function initTitlebar() {
  const btnMin = $("#btn-minimize");
  const btnMax = $("#btn-maximize");
  const btnClose = $("#btn-close");
  if (!btnMin && !btnMax && !btnClose) return;

  if (btnMin) {
    btnMin.addEventListener("click", () => {
      if (window.mogugeo?.windowMinimize) window.mogugeo.windowMinimize();
    });
  }

  if (btnMax) {
    btnMax.addEventListener("click", () => {
      if (window.mogugeo?.windowMaximize) window.mogugeo.windowMaximize();
    });
  }

  if (btnClose) {
    btnClose.addEventListener("click", () => {
      if (window.mogugeo?.windowClose) window.mogugeo.windowClose();
    });
  }
}

async function initializePage() {
  const state = getState();
  initDarkMode(state);
  initSwitches();
  initDemoActions();
  initTitlebar();
  initSlideMenu();

  await (window.MoGugeoData?.ready || Promise.resolve());

  initLogin();
  initSignup();
  initOnboarding();
  initDashboard();
  initSentence();
  initMyPage();
  initSettings();
  initPopup();
}

document.addEventListener("DOMContentLoaded", () => {
  initializePage().catch((error) => {
    console.error("Failed to initialize MoGugeo renderer data.", error);
  });
});
