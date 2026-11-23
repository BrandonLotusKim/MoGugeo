/* 모국어 렌더러: 화면별 초기화와 DOM 처리. 계산 로직은 core.js(MoGugeoCore)에 있다. */

const Core = window.MoGugeoCore;
const STATE_KEY = "mogugeo_state";
const OS_SYNC_KEY = "mogugeo_os_synced";
const ISSUES_URL = "https://github.com/BrandonLotusKim/MoGugeo/issues";

/* ---------- 상태 ---------- */

function getState() {
  try {
    const saved = localStorage.getItem(STATE_KEY);
    if (!saved) return Core.getDefaultState();
    const parsed = JSON.parse(saved);
    const migrated = Core.migrateState(parsed, new Date());
    if (parsed?.schemaVersion !== Core.CURRENT_SCHEMA_VERSION && migrated.schemaVersion === Core.CURRENT_SCHEMA_VERSION) {
      saveState(migrated);
    }
    return migrated;
  } catch {
    return Core.getDefaultState();
  }
}

function saveState(state) {
  localStorage.setItem(STATE_KEY, JSON.stringify(state));
}

/**
 * 저장 직전에 최신 상태를 다시 읽어 바꾼다.
 * 메인 창과 데일리 팝업 창이 같은 저장소를 쓰므로, 화면을 열 때 읽어 둔 상태를 그대로 저장하면
 * 그사이 다른 창이 저장한 기록이 지워진다.
 */
function updateState(mutate) {
  const state = getState();
  const result = mutate(state);
  saveState(state);
  return { state, result };
}

/** 다른 창이 상태를 바꿨을 때 알림 (같은 창의 저장에는 오지 않는다) */
function onStateChangedElsewhere(handler) {
  window.addEventListener("storage", (event) => {
    if (event.key === STATE_KEY || event.key === null) handler(getState());
  });
}

function getSentences() {
  return window.MoGugeoData?.sentences || [];
}

function getSentenceMap() {
  return new Map(getSentences().map((sentence) => [Core.getSentenceId(sentence), sentence]));
}

function getNickname(state) {
  return state.profile?.nickname || "학습자";
}

/* ---------- DOM 도우미 ---------- */

function $(selector, root = document) {
  return root.querySelector(selector);
}

function $all(selector, root = document) {
  return Array.from(root.querySelectorAll(selector));
}

function el(tag, options = {}, children = []) {
  const node = document.createElement(tag);
  if (options.className) node.className = options.className;
  if (options.text !== undefined) node.textContent = options.text;
  if (options.attrs) {
    Object.entries(options.attrs).forEach(([key, value]) => {
      if (value !== undefined && value !== null) node.setAttribute(key, value);
    });
  }
  (Array.isArray(children) ? children : [children]).forEach((child) => {
    if (child) node.append(child);
  });
  return node;
}

function icon(name) {
  return el("span", { className: "material-symbols-outlined", text: name, attrs: { "aria-hidden": "true" } });
}

function formatDate(value) {
  const time = Date.parse(value);
  if (Number.isNaN(time)) return "-";
  return new Date(time).toLocaleDateString("ko-KR", { month: "long", day: "numeric", weekday: "short" });
}

function formatTimeLabel(time) {
  if (!Core.TIME_PATTERN.test(time || "")) return time || "";
  const [hour, minute] = time.split(":").map(Number);
  const period = hour < 12 ? "오전" : "오후";
  const displayHour = hour % 12 === 0 ? 12 : hour % 12;
  return `${period} ${displayHour}:${String(minute).padStart(2, "0")}`;
}

/** 오류 문구를 넣을 곳: 필드를 감싼 .field/.check-row (선택지 그리드 안에 넣으면 칸 하나 폭으로 좁아진다) */
function getErrorHolder(field) {
  return field.closest(".field, .check-row") || field.parentElement;
}

/** 필드 아래 오류 문구 표시 (색 + 문구 + aria) */
function setFieldError(field, message) {
  if (!field) return;
  const holder = getErrorHolder(field);
  const id = `${field.id || field.name || "field"}-error`;
  let error = holder.querySelector(`#${CSS.escape(id)}`);
  if (!error) {
    error = el("p", { className: "field-error", attrs: { id, role: "alert" } });
    holder.appendChild(error);
  }
  error.textContent = message;
  error.hidden = false;
  field.setAttribute("aria-invalid", "true");
  field.setAttribute("aria-describedby", id);
  field.classList.add("is-invalid");
}

function clearFieldError(field) {
  if (!field) return;
  const holder = getErrorHolder(field);
  const id = `${field.id || field.name || "field"}-error`;
  const error = holder.querySelector(`#${CSS.escape(id)}`);
  if (error) error.hidden = true;
  field.removeAttribute("aria-invalid");
  field.classList.remove("is-invalid");
}

function focusFirstInvalid(fields) {
  const first = fields.find((field) => field && field.getAttribute("aria-invalid") === "true");
  if (first) {
    first.scrollIntoView({ block: "center" });
    first.focus();
  }
  return Boolean(first);
}

function createEmptyState(message, linkText, href) {
  const children = [el("p", { className: "empty-state-copy", text: message })];
  if (linkText && href) {
    children.push(el("a", { className: "btn btn-soft empty-state-link", text: linkText, attrs: { href } }));
  }
  return el("div", { className: "empty-state" }, children);
}

/* ---------- 공통 ---------- */

function applyDarkMode(enabled) {
  document.body.classList.toggle("dark", Boolean(enabled));
}

function setSwitchState(element, enabled) {
  if (!element) return;
  element.classList.toggle("on", Boolean(enabled));
  element.setAttribute("aria-checked", String(Boolean(enabled)));
}

function initSwitches() {
  $all('button.switch[role="switch"]').forEach((sw) => {
    sw.addEventListener("click", () => {
      const isOn = sw.classList.toggle("on");
      sw.setAttribute("aria-checked", String(isOn));
      sw.dispatchEvent(new CustomEvent("switch-change", { detail: { on: isOn } }));
    });
  });
}

function initTitlebar() {
  $("#btn-minimize")?.addEventListener("click", () => window.mogugeo?.windowMinimize?.());
  $("#btn-maximize")?.addEventListener("click", () => window.mogugeo?.windowMaximize?.());
  $("#btn-close")?.addEventListener("click", () => window.mogugeo?.windowClose?.());
}

function initExternalLinks() {
  $all("[data-external]").forEach((link) => {
    link.addEventListener("click", (event) => {
      event.preventDefault();
      const url = link.getAttribute("href");
      if (window.mogugeo?.openExternal) {
        window.mogugeo.openExternal(url);
      } else {
        window.open(url, "_blank", "noopener");
      }
    });
  });
}

function logout() {
  const state = getState();
  state.signedOut = true;
  saveState(state);
  if (window.mogugeo?.shrinkWindow) {
    window.mogugeo.shrinkWindow();
    return;
  }
  window.location.href = "main.html";
}

function initSlideMenu() {
  const btnOpen = $("#btn-menu-open");
  const btnClose = $("#btn-menu-close");
  const overlay = $("#menu-overlay");
  const menu = $("#slide-menu");

  if (btnOpen && menu) {
    const openMenu = () => {
      menu.classList.add("open");
      overlay?.classList.add("open");
      btnOpen.setAttribute("aria-expanded", "true");
      $("a, button", menu)?.focus();
    };
    const closeMenu = () => {
      menu.classList.remove("open");
      overlay?.classList.remove("open");
      btnOpen.setAttribute("aria-expanded", "false");
    };
    btnOpen.addEventListener("click", openMenu);
    btnClose?.addEventListener("click", closeMenu);
    overlay?.addEventListener("click", closeMenu);
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && menu.classList.contains("open")) closeMenu();
    });
  }

  $all("[data-logout]").forEach((button) => {
    button.addEventListener("click", (event) => {
      event.preventDefault();
      logout();
    });
  });
}

/** 사이드바·상단의 닉네임 표시 */
function renderProfileName(state) {
  $all("[data-profile-name]").forEach((node) => {
    node.textContent = getNickname(state);
  });
}

/**
 * 앱을 켤 때 한 번, 저장된 설정을 OS(작업 스케줄러·시작 프로그램)에 반영한다.
 * 실제 반영은 패키지 설치본에서만 일어나고, 개발 모드에서는 메인 프로세스가 무시한다.
 */
async function syncOsSettingsOnce(state) {
  try {
    if (sessionStorage.getItem(OS_SYNC_KEY)) return;
    sessionStorage.setItem(OS_SYNC_KEY, "1");
  } catch {
    return;
  }
  try {
    await window.mogugeo?.setDailyPopup?.(state.settings.dailyPopupEnabled, state.settings.popupTime);
    await window.mogugeo?.setAutoStart?.(state.settings.autoStart);
  } catch (error) {
    console.warn("OS 설정 동기화 실패", error);
  }
}

function requireProfile(state) {
  if (state.profile) return true;
  if (window.mogugeo?.shrinkWindow) {
    window.mogugeo.shrinkWindow();
  } else {
    window.location.href = "main.html";
  }
  return false;
}

/* ---------- 로그인 (로컬 프로필 선택) ---------- */

function enterApp() {
  if (window.mogugeo?.expandWindow) {
    window.mogugeo.expandWindow();
    return;
  }
  window.location.href = "dashboard.html";
}

function initLogin() {
  const root = $("[data-login]");
  if (!root) return;

  const state = getState();
  const profileView = $("#login-profile");
  const emptyView = $("#login-empty");

  if (!state.profile) {
    if (profileView) profileView.hidden = true;
    if (emptyView) emptyView.hidden = false;
    const migratedNote = $("#login-existing-data");
    if (migratedNote) migratedNote.hidden = state.studyLog.length === 0;
    return;
  }

  if (emptyView) emptyView.hidden = true;
  if (profileView) profileView.hidden = false;

  $("#login-avatar").textContent = state.profile.nickname.slice(0, 1).toUpperCase();
  $("#login-nickname").textContent = state.profile.nickname;
  $("#login-meta").textContent = `${Core.getDifficultyLabel(state.settings.difficulty)} · 학습 ${Core.countStudyDays(state.studyLog)}일`;

  const autoLogin = $("#login-auto");
  if (autoLogin) {
    autoLogin.checked = state.settings.autoLogin;
    autoLogin.addEventListener("change", () => {
      const latest = getState();
      latest.settings.autoLogin = autoLogin.checked;
      saveState(latest);
    });
  }

  $("#btn-login-start")?.addEventListener("click", () => {
    const latest = getState();
    latest.signedOut = false;
    saveState(latest);
    enterApp();
  });

  // 자동 로그인: 직접 로그아웃하지 않았다면 바로 대시보드로
  if (state.settings.autoLogin && !state.signedOut) {
    enterApp();
  }
}

/* ---------- 프로필 만들기 ---------- */

function initSignup() {
  const form = $("[data-signup-form]");
  if (!form) return;

  const state = getState();
  const nicknameInput = $("#signup-nickname");
  const agreeInput = $("#signup-agree");
  const difficultyInputs = $all('input[name="difficulty"]', form);
  const difficultyGroup = $("#signup-difficulty");

  const current = state.settings.difficulty;
  difficultyInputs.forEach((input) => {
    input.checked = input.value === current;
  });

  if (state.profile) {
    const notice = $("#signup-replace-notice");
    if (notice) {
      notice.hidden = false;
      notice.textContent = `이미 "${state.profile.nickname}" 프로필이 있습니다. 새로 만들면 닉네임과 난이도만 바뀌고 학습 기록은 그대로 남습니다.`;
    }
    nicknameInput.value = state.profile.nickname;
  }

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    [nicknameInput, agreeInput].forEach(clearFieldError);
    if (difficultyGroup) clearFieldError(difficultyGroup);

    const nicknameError = Core.validateNickname(nicknameInput.value);
    if (nicknameError) setFieldError(nicknameInput, nicknameError);

    const selected = difficultyInputs.find((input) => input.checked);
    if (!selected && difficultyGroup) setFieldError(difficultyGroup, "난이도를 하나 고르세요.");

    if (!agreeInput.checked) setFieldError(agreeInput, "이용약관과 개인정보 처리방침에 동의해야 시작할 수 있습니다.");

    if (focusFirstInvalid([nicknameInput, difficultyGroup, agreeInput])) return;

    const latest = getState();
    Core.createProfile(latest, {
      nickname: nicknameInput.value,
      difficulty: selected.value,
      now: new Date(),
    });
    saveState(latest);
    enterApp();
  });

  nicknameInput.addEventListener("input", () => clearFieldError(nicknameInput));
  agreeInput.addEventListener("change", () => clearFieldError(agreeInput));
  difficultyInputs.forEach((input) => input.addEventListener("change", () => clearFieldError(difficultyGroup)));
}

/* ---------- 온보딩 ---------- */

function initOnboarding() {
  const stage = $(".onboarding-stage");
  if (!stage) return;

  const state = getState();
  if (!requireProfile(state)) return;

  const steps = $all(".onboarding-step");
  const dots = $all(".onboarding-dot");
  const prevBtn = $("#onboarding-prev");
  const nextBtn = $("#onboarding-next");
  const startBtn = $("#onboarding-start");
  const timeInput = $("#onboarding-popup-time");
  const popupToggle = $("#onboarding-popup-toggle");
  let currentStep = 0;

  if (timeInput) timeInput.value = state.settings.popupTime;
  if (popupToggle) popupToggle.checked = state.settings.dailyPopupEnabled;
  const levelLabel = $("#onboarding-level");
  if (levelLabel) levelLabel.textContent = Core.getDifficultyLabel(state.settings.difficulty);

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
      if (isActive) dot.setAttribute("aria-current", "step");
      else dot.removeAttribute("aria-current");
    });
    if (prevBtn) prevBtn.disabled = currentStep === 0;
    if (nextBtn) nextBtn.hidden = currentStep === steps.length - 1;
    if (startBtn) startBtn.hidden = currentStep !== steps.length - 1;
  }

  prevBtn?.addEventListener("click", () => renderStep(Math.max(0, currentStep - 1)));
  nextBtn?.addEventListener("click", () => renderStep(Math.min(steps.length - 1, currentStep + 1)));
  dots.forEach((dot, index) => dot.addEventListener("click", () => renderStep(index)));

  startBtn?.addEventListener("click", async () => {
    const latest = getState();
    if (timeInput && Core.TIME_PATTERN.test(timeInput.value)) latest.settings.popupTime = timeInput.value;
    if (popupToggle) latest.settings.dailyPopupEnabled = popupToggle.checked;
    latest.onboardingSeen = true;
    saveState(latest);
    try {
      await window.mogugeo?.setDailyPopup?.(latest.settings.dailyPopupEnabled, latest.settings.popupTime);
    } catch (error) {
      console.warn("데일리 팝업 설정 반영 실패", error);
    }
    window.location.href = "dashboard.html";
  });

  renderStep(0);
}

/* ---------- 대시보드 ---------- */

function initDashboard() {
  if (!$("#dash-progress-text")) return;
  const state = getState();
  if (!requireProfile(state)) return;
  if (!state.onboardingSeen) {
    window.location.href = "onboarding.html";
    return;
  }
  syncOsSettingsOnce(state);
  renderDashboard(state);
  // 데일리 팝업 창에서 문제를 풀면 대시보드 숫자도 바로 바뀐다.
  onStateChangedElsewhere(renderDashboard);
}

function renderDashboard(state) {
  const now = new Date();
  const today = Core.getTodaySummary(state.studyLog, now);
  const streak = Core.computeStreak(state.studyLog, now);
  const dueCount = Core.getDueReviewItems(state, now).length;
  const hour = now.getHours();
  const greeting = hour < 12 ? "좋은 아침입니다" : hour < 18 ? "좋은 오후입니다" : "좋은 저녁입니다";

  $("#dash-greeting").textContent = `${greeting}, ${getNickname(state)}님.`;
  renderProfileName(state);
  $("#dash-hero-copy").textContent = state.studyLog.length === 0
    ? "아직 학습 기록이 없습니다. 첫 문장을 풀어 보세요."
    : today.total >= today.goal
      ? `오늘 목표 ${today.goal}문장을 채웠습니다. 복습까지 마치면 더 좋습니다.`
      : `오늘 ${today.total}문장을 풀었습니다. 목표까지 ${today.goal - today.total}문장 남았습니다.`;

  $("#dash-progress-text").textContent = `${today.total} / ${today.goal}`;
  $("#dash-progress-bar").style.width = `${today.percent}%`;
  const progressbar = $("#dash-progress");
  if (progressbar) progressbar.setAttribute("aria-valuenow", String(today.total));
  $("#dash-remaining").textContent = today.total
    ? `오늘 정답 ${today.correct}개 · 난이도 ${Core.getDifficultyLabel(state.settings.difficulty)}`
    : `난이도 ${Core.getDifficultyLabel(state.settings.difficulty)} · 오늘 아직 풀지 않았습니다`;

  $("#dash-streak").textContent = `${streak}일 연속`;

  const reviewBtn = $("#dash-review-btn");
  const reviewCopy = $("#dash-review-copy");
  if (reviewBtn) {
    if (dueCount > 0) {
      reviewBtn.removeAttribute("aria-disabled");
      reviewBtn.classList.remove("is-disabled");
      reviewBtn.setAttribute("href", "sentence.html?mode=review");
      reviewBtn.textContent = `복습 ${dueCount}개 시작`;
    } else {
      reviewBtn.setAttribute("aria-disabled", "true");
      reviewBtn.classList.add("is-disabled");
      reviewBtn.removeAttribute("href");
      reviewBtn.textContent = "오늘 복습 없음";
    }
  }
  if (reviewCopy) {
    reviewCopy.textContent = dueCount > 0
      ? `틀렸던 문장 ${dueCount}개가 오늘 다시 볼 차례입니다.`
      : `복습 노트 ${state.reviewList.length}개 · 오늘 도래한 항목은 없습니다.`;
  }

  renderLatestEntry(state);
  renderStreakCalendar(state, now);
}

function renderLatestEntry(state) {
  const box = $("#dash-latest");
  if (!box) return;
  const latest = Core.getLatestEntry(state.studyLog);
  box.replaceChildren();
  if (!latest) {
    box.append(createEmptyState("문장을 풀면 가장 최근 결과가 여기에 표시됩니다.", "문장 학습 시작", "sentence.html"));
    return;
  }
  const sentence = getSentenceMap().get(latest.contentId);
  const badge = el("span", {
    className: `result-badge ${latest.isCorrect ? "pass" : "fail"}`,
  }, [icon(latest.isCorrect ? "check_circle" : "cancel"), el("span", { text: latest.isCorrect ? "정답" : "오답" })]);
  box.append(
    el("div", { className: "latest-head" }, [badge, el("span", { className: "latest-score", text: `${latest.score}점` })]),
    el("p", { className: "latest-sentence", text: sentence?.english || latest.contentId }),
    el("p", {
      className: "fine-copy small",
      text: `${formatDate(latest.date)} · ${latest.direction === "ko-to-en" ? "한→영 작문" : "영→한 해석"} · ${latest.source === "popup" ? "데일리 팝업" : latest.source === "review" ? "복습" : "문장 학습"}`,
    }),
    el("a", { className: "link-action", attrs: { href: "mypage.html" } }, [el("span", { text: "학업 성취도 보기" }), icon("arrow_forward")]),
  );
}

function renderStreakCalendar(state, now) {
  const grid = $(".streak-grid");
  if (!grid) return;
  const heads = ["월", "화", "수", "목", "금", "토", "일"].map((label) => el("div", { className: "streak-head", text: label }));
  const statusText = { active: "학습함", current: "오늘", pending: "예정", missed: "학습 안 함" };
  const cells = Core.getStreakCalendar(state.studyLog, now).map((cell) => el("div", {
    className: `streak-day ${cell.status}${cell.isToday ? " today" : ""}`,
    text: String(cell.day),
    attrs: { title: `${cell.key} ${statusText[cell.status]}`, "aria-label": `${cell.key} ${statusText[cell.status]}` },
  }));
  grid.replaceChildren(...heads, ...cells);
}

/* ---------- 문장 학습 / 복습 ---------- */

function initSentence() {
  const textEl = $("#sentence-text");
  if (!textEl) return;

  let state = getState();
  if (!requireProfile(state)) return;

  const sentences = getSentences();
  const params = new URLSearchParams(window.location.search);
  let mode = params.get("mode") === "review" ? "review" : "new";
  let repeat = false;
  const answeredThisSession = new Set();
  const skippedThisSession = new Set();
  let current = null;
  let answered = false;

  const card = $("#sentence-card");
  const exhausted = $("#sentence-exhausted");
  const textarea = $("#translation");
  const checkBtn = $("#btn-check-sentence");
  const nextBtn = $("#btn-next-sentence");
  const reviewBtn = $("#btn-add-review");
  const feedback = $("#feedback-section");
  const modeChip = $("#sentence-mode");

  function renderProgress() {
    const today = Core.getTodaySummary(state.studyLog, new Date());
    $("#sentence-progress-text").textContent = `오늘 ${today.total} / ${today.goal}문장`;
    $("#sentence-progress-bar").style.width = `${today.percent}%`;
  }

  function syncReviewButton() {
    if (!reviewBtn || !current) return;
    const queued = Boolean(Core.findReviewItem(state, Core.getSentenceId(current)));
    reviewBtn.textContent = queued ? "복습 노트에 있음" : "복습 노트에 추가";
    reviewBtn.disabled = queued;
  }

  function seenThisSession() {
    return new Set([...answeredThisSession, ...skippedThisSession]);
  }

  function pick() {
    const now = new Date();
    const seen = seenThisSession();
    if (mode === "review") {
      return Core.getDueSentences(state, sentences, now)
        .find((sentence) => !seen.has(Core.getSentenceId(sentence))) || null;
    }
    if (repeat) return Core.pickRepeatSentence(state, sentences, seen);
    return Core.pickNextNewSentence(state, sentences, seen);
  }

  /** 건너뛴 문장 중 아직 풀 차례인 것(복습: 오늘 도래, 새 문장: 아직 안 푼 것, 다시 풀기: 이번에 안 푼 것) */
  function countSkippedLeft() {
    const now = new Date();
    if (mode === "review") {
      return Core.getDueSentences(state, sentences, now)
        .filter((sentence) => skippedThisSession.has(Core.getSentenceId(sentence))).length;
    }
    if (repeat) {
      return Core.getSentencesForDifficulty(sentences, state.settings.difficulty)
        .filter((sentence) => skippedThisSession.has(Core.getSentenceId(sentence))
          && !answeredThisSession.has(Core.getSentenceId(sentence))).length;
    }
    const studied = new Set(state.studyLog.map((entry) => entry.contentId));
    return Core.getSentencesForDifficulty(sentences, state.settings.difficulty)
      .filter((sentence) => skippedThisSession.has(Core.getSentenceId(sentence))
        && !studied.has(Core.getSentenceId(sentence))).length;
  }

  function actionButton(text, className, onClick) {
    const button = el("button", { className: `btn ${className}`, text, attrs: { type: "button" } });
    button.addEventListener("click", onClick);
    return button;
  }

  function showExhausted() {
    current = null;
    card.hidden = true;
    feedback.hidden = true;
    reviewBtn.hidden = true;
    nextBtn.hidden = true;
    exhausted.hidden = false;
    const dueCount = Core.getDueReviewItems(state, new Date()).length;
    const skippedLeft = countSkippedLeft();
    const title = $("#exhausted-title");
    const copy = $("#exhausted-copy");
    const actions = $("#exhausted-actions");
    actions.replaceChildren();

    const retrySkipped = actionButton("건너뛴 문장 다시 보기", "btn-primary", () => {
      skippedThisSession.clear();
      load();
      if (current) textarea.focus();
    });

    if (mode === "review") {
      if (skippedLeft) {
        title.textContent = `건너뛴 복습 문장 ${skippedLeft}개가 남았습니다.`;
        copy.textContent = "지금 다시 보거나, 나중에 대시보드의 복습 버튼으로 이어서 풀 수 있습니다.";
        actions.append(retrySkipped);
        actions.append(el("a", { className: "btn btn-ghost", text: "대시보드로", attrs: { href: "dashboard.html" } }));
      } else {
        title.textContent = "오늘 복습할 문장을 모두 봤습니다.";
        copy.textContent = "다음 복습일이 된 문장은 대시보드와 데일리 팝업에 다시 나옵니다.";
        actions.append(el("a", { className: "btn btn-primary", text: "새 문장 학습", attrs: { href: "sentence.html" } }));
      }
    } else if (skippedLeft) {
      title.textContent = `건너뛴 문장 ${skippedLeft}개가 남았습니다.`;
      copy.textContent = "건너뛴 문장은 기록되지 않습니다. 지금 다시 보거나 설정에서 난이도를 바꿀 수 있습니다.";
      actions.append(retrySkipped);
      actions.append(el("a", { className: "btn btn-ghost", text: "난이도 바꾸기", attrs: { href: "settings.html#difficulty" } }));
    } else {
      const total = Core.getSentencesForDifficulty(sentences, state.settings.difficulty).length;
      const label = Core.getDifficultyLabel(state.settings.difficulty);
      title.textContent = total
        ? `${label} 문장 ${total}개를 모두 풀었습니다.`
        : `${label} 난이도 문장이 없습니다.`;
      copy.textContent = "오래전에 푼 문장부터 다시 풀거나, 설정에서 난이도를 바꿀 수 있습니다.";
      if (total) {
        actions.append(actionButton("다시 풀기", "btn-primary", () => {
          // 다시 풀기는 이번 세션에 본 문장도 다시 후보로 넣는다.
          repeat = true;
          answeredThisSession.clear();
          skippedThisSession.clear();
          load();
          if (current) textarea.focus();
        }));
      }
      actions.append(el("a", { className: "btn btn-ghost", text: "난이도 바꾸기", attrs: { href: "settings.html#difficulty" } }));
      if (dueCount) {
        actions.append(el("a", { className: "btn btn-soft", text: `복습 ${dueCount}개`, attrs: { href: "sentence.html?mode=review" } }));
      }
    }
    $("button, a", actions)?.focus();
  }

  function load() {
    current = pick();
    renderProgress();
    if (!current) {
      showExhausted();
      return;
    }
    answered = false;
    card.hidden = false;
    exhausted.hidden = true;
    feedback.hidden = true;
    reviewBtn.hidden = false;
    nextBtn.hidden = false;
    textEl.textContent = current.english;
    textarea.value = "";
    textarea.disabled = false;
    checkBtn.disabled = false;
    clearFieldError(textarea);

    const label = Core.getDifficultyLabel(current.level);
    if (mode === "review") {
      const item = Core.findReviewItem(state, Core.getSentenceId(current));
      modeChip.textContent = `복습 · ${label} · ${item ? `${item.level + 1}단계` : ""}`;
    } else {
      modeChip.textContent = `${repeat ? "다시 풀기" : "새 문장"} · ${label}`;
    }
    syncReviewButton();
  }

  if (!sentences.length) {
    textEl.textContent = "문장 데이터를 불러오지 못했습니다.";
    return;
  }

  checkBtn.addEventListener("click", () => {
    if (answered || !current) return;
    const answer = textarea.value.trim();
    if (!answer) {
      setFieldError(textarea, "해석을 입력한 뒤 확인하세요.");
      textarea.focus();
      return;
    }
    answered = true;
    const score = Core.scoreKoreanTranslation(answer, current);
    const update = updateState((latest) => Core.submitAnswer(latest, {
      contentId: Core.getSentenceId(current),
      direction: "en-to-ko",
      score,
      source: mode === "review" ? "review" : "sentence",
      now: new Date(),
    }));
    state = update.state;
    const result = update.result;
    answeredThisSession.add(Core.getSentenceId(current));
    textarea.disabled = true;
    checkBtn.disabled = true;
    renderFeedback(current, answer, result);
    renderProgress();
    syncReviewButton();
    nextBtn.focus();
  });

  textarea.addEventListener("input", () => clearFieldError(textarea));
  textarea.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      checkBtn.click();
    }
  });

  nextBtn.addEventListener("click", () => {
    if (!answered && current) {
      // 풀지 않고 넘기면 이번 세션에서만 건너뛴다(기록하지 않음).
      skippedThisSession.add(Core.getSentenceId(current));
    }
    load();
    if (current) textarea.focus();
  });

  reviewBtn.addEventListener("click", () => {
    if (!current) return;
    const contentId = Core.getSentenceId(current);
    state = updateState((latest) => Core.addReviewItem(latest, contentId, new Date())).state;
    syncReviewButton();
  });

  // 데일리 팝업 등 다른 창에서 저장하면 진행도와 복습 노트 상태를 맞춘다.
  onStateChangedElsewhere((latest) => {
    state = latest;
    renderProgress();
    syncReviewButton();
  });

  $("#btn-play-audio")?.addEventListener("click", () => speakText(current?.english));

  load();
}

function renderFeedback(sentence, userAnswer, result) {
  const feedback = $("#feedback-section");
  feedback.hidden = false;

  const banner = $("#sentence-result");
  const hint = Core.getKoreanFormHint(userAnswer, sentence);
  banner.className = `result-banner ${result.isCorrect ? "pass" : "fail"}`;
  banner.replaceChildren(
    icon(result.isCorrect ? "check_circle" : "cancel"),
    el("div", {}, [
      el("strong", { className: "result-title", text: result.isCorrect ? "정답입니다" : "다시 볼 문장입니다" }),
      el("p", { className: "result-copy", text: getReviewMessage(result, sentence) }),
      hint ? el("p", { className: "result-copy result-hint", text: hint }) : null,
    ]),
    el("span", { className: "result-score", text: `${result.score}점` }),
  );

  $("#feedback-user-answer").textContent = userAnswer;
  $("#feedback-model-answer").textContent = sentence.answer;
  $("#feedback-tip").textContent = sentence.tip || "-";
  $("#feedback-grammar").textContent = sentence.grammar || "-";
  $("#feedback-extra").textContent = sentence.extra || "-";
}

function getReviewMessage(result, sentence) {
  const state = getState();
  const item = Core.findReviewItem(state, Core.getSentenceId(sentence));
  const base = `${Core.PASS_SCORE}점 이상이면 정답으로 봅니다.`;
  switch (result.reviewAction) {
    case "added":
      return `${base} 복습 노트에 추가했고, 내일 다시 나옵니다.`;
    case "promoted":
      return `${base} 복습 ${item ? item.level + 1 : ""}단계로 올라갔습니다. 다음 복습: ${item ? formatDate(item.nextReviewAt) : "-"}`;
    case "reset":
      return `${base} 복습 단계를 처음으로 되돌렸고, 내일 다시 나옵니다.`;
    default:
      return base;
  }
}

/** 브라우저 음성 목록 (처음에는 비어 있다가 voiceschanged 뒤에 채워질 수 있다) */
function loadBrowserVoices(timeoutMs = 800) {
  if (!window.speechSynthesis) return Promise.resolve([]);
  const voices = window.speechSynthesis.getVoices();
  if (voices.length) return Promise.resolve(voices);
  return new Promise((resolve) => {
    const done = () => resolve(window.speechSynthesis.getVoices());
    window.speechSynthesis.addEventListener("voiceschanged", done, { once: true });
    setTimeout(done, timeoutMs);
  });
}

/**
 * 영어 문장 읽기.
 * 1) 브라우저 음성 중 영어 음성이 있으면 그것으로 읽는다.
 * 2) 없으면(Windows 에 따라 한국어 음성만 보이는 경우가 있다) 앱이 Windows 음성(SAPI)의 영어 음성으로 읽는다.
 * 영어 음성이 아예 없으면 한국어 음성으로 영어를 읽지 않고 설치 방법을 안내한다.
 */
async function speakText(text, lang = "en-US") {
  const content = String(text || "").trim();
  const status = $("#audio-status");
  const setStatus = (message) => {
    if (status) status.textContent = message;
  };
  if (!content) return;

  const voices = await loadBrowserVoices();
  const englishVoice = voices.find((voice) => voice.lang === lang)
    || voices.find((voice) => /^en(-|_|$)/i.test(voice.lang));

  if (englishVoice && typeof window.SpeechSynthesisUtterance !== "undefined") {
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(content);
    utterance.lang = englishVoice.lang;
    utterance.voice = englishVoice;
    utterance.onerror = (event) => {
      if (event.error !== "canceled" && event.error !== "interrupted") {
        setStatus("음성을 재생하지 못했습니다. 잠시 뒤 다시 눌러 보세요.");
      }
    };
    setStatus("");
    window.speechSynthesis.speak(utterance);
    return;
  }

  if (window.mogugeo?.speakEnglish) {
    window.speechSynthesis?.cancel();
    setStatus("Windows 영어 음성으로 읽는 중입니다.");
    const result = await window.mogugeo.speakEnglish(content);
    if (result?.ok) {
      setStatus("");
    } else if (result?.reason === "no-english-voice") {
      setStatus("이 PC에 영어 음성이 없습니다. Windows 설정 > 시간 및 언어 > 음성에서 영어 음성을 추가하세요.");
    } else if (result?.reason !== "canceled") {
      setStatus("음성을 재생하지 못했습니다. 잠시 뒤 다시 눌러 보세요.");
    }
    return;
  }

  setStatus("이 PC에 영어 음성이 없습니다. Windows 설정 > 시간 및 언어 > 음성에서 영어 음성을 추가하세요.");
}

/* ---------- 학업 성취도 (마이페이지) ---------- */

function initMyPage() {
  if (!$("#profile-name")) return;
  const state = getState();
  if (!requireProfile(state)) return;
  renderMyPage(state);
  onStateChangedElsewhere(renderMyPage);

  const darkToggle = $("#dark-mode-toggle");
  if (darkToggle) {
    setSwitchState(darkToggle, state.darkMode);
    darkToggle.addEventListener("switch-change", (event) => {
      const { state: latest } = updateState((draft) => {
        draft.darkMode = event.detail.on;
      });
      applyDarkMode(latest.darkMode);
    });
  }
}

function renderMyPage(state) {
  const now = new Date();
  renderProfileName(state);
  applyDarkMode(state.darkMode);
  setSwitchState($("#dark-mode-toggle"), state.darkMode);

  $("#profile-name").textContent = `반가워요, ${getNickname(state)}님.`;
  $("#profile-avatar-initial").textContent = getNickname(state).slice(0, 1).toUpperCase();
  $("#total-days").textContent = `총 학습일 ${Core.countStudyDays(state.studyLog)}일 · 푼 문장 ${state.studyLog.length}개`;
  $("#streak-chip").textContent = `${Core.computeStreak(state.studyLog, now)}일 연속`;
  $("#profile-level").textContent = `난이도 ${Core.getDifficultyLabel(state.settings.difficulty)}`;

  renderAccuracyChart(state, now);
  renderHeatmap(state, now);
  renderReviewNote(state);

  $("#account-nickname").textContent = getNickname(state);
  $("#account-difficulty").textContent = Core.getDifficultyLabel(state.settings.difficulty);
  $("#account-created").textContent = state.profile?.createdAt ? formatDate(state.profile.createdAt) : "-";
}

function renderAccuracyChart(state, now) {
  const area = $(".chart-area");
  if (!area) return;
  if (!state.studyLog.length) {
    area.replaceChildren(createEmptyState("아직 학습 기록이 없습니다. 문장을 풀면 최근 7일 정답률이 표시됩니다.", "문장 학습 시작", "sentence.html"));
    return;
  }
  const days = Core.getLast7Days(state.studyLog, now);
  area.replaceChildren(...days.map((day) => {
    const label = day.accuracy === null
      ? `${day.key}: 기록 없음`
      : `${day.key}: ${day.total}문장, 정답률 ${day.accuracy}%`;
    const track = el("div", { className: `chart-track${day.accuracy === null ? " empty" : ""}` });
    if (day.accuracy !== null) {
      track.append(el("div", {
        className: `chart-value${day.isToday ? " today" : ""}`,
        attrs: { style: `height: ${Math.max(4, day.accuracy)}%;` },
      }));
    }
    return el("div", { className: "chart-col", attrs: { title: label, role: "img", "aria-label": label } }, [
      el("div", { className: "chart-number", text: day.accuracy === null ? "-" : `${day.accuracy}%` }),
      track,
      el("div", { className: "chart-label", text: day.isToday ? "오늘" : day.label }),
    ]);
  }));
}

function renderHeatmap(state, now) {
  const heatmap = $(".heatmap");
  if (!heatmap) return;
  if (!state.studyLog.length) {
    heatmap.classList.add("is-empty");
    heatmap.replaceChildren(createEmptyState("학습한 날이 여기에 칠해집니다."));
    return;
  }
  heatmap.classList.remove("is-empty");
  const cells = Core.getHeatmap(state.studyLog, now, 12).map((cell) => el("div", {
    className: `heat-cell l${cell.level}${cell.future ? " future" : ""}`,
    attrs: { title: `${cell.key}: ${cell.count}문장` },
  }));
  heatmap.replaceChildren(...cells);
  heatmap.setAttribute("aria-label", `최근 12주 동안 ${Core.countStudyDays(state.studyLog)}일 학습`);
}

function renderReviewNote(initialState) {
  const container = $("#review-list-container");
  if (!container) return;
  const countEl = $("#review-list-count");
  const startBtn = $("#review-start-btn");
  const sentenceMap = getSentenceMap();
  let state = initialState;

  function render() {
    const now = new Date();
    const due = Core.getDueReviewItems(state, now);
    const dueIds = new Set(due.map((item) => item.contentId));
    if (countEl) countEl.textContent = `오늘 ${due.length}개 · 전체 ${state.reviewList.length}개`;
    if (startBtn) startBtn.hidden = due.length === 0;
    container.replaceChildren();

    if (!state.reviewList.length) {
      container.append(el("p", { className: "muted", text: "복습 노트가 비어 있습니다. 틀린 문장이 자동으로 모입니다." }));
      return;
    }

    const items = state.reviewList.slice().sort((a, b) => Date.parse(a.nextReviewAt) - Date.parse(b.nextReviewAt));
    const list = el("div", { className: "list-stack" });
    items.forEach((item) => {
      const sentence = sentenceMap.get(item.contentId);
      const interval = Core.REVIEW_INTERVAL_DAYS[item.level];
      const isDue = dueIds.has(item.contentId);
      // 도래한 항목은 지난 날짜 대신 "오늘 복습"으로 보여 준다.
      const meta = `${item.level + 1}단계(${interval}일 간격) · ${isDue ? "오늘 복습할 차례" : `다음 복습 ${formatDate(item.nextReviewAt)}`}`;
      const removeBtn = el("button", { className: "link-action", text: "삭제", attrs: { type: "button", "aria-label": `${sentence?.english || item.contentId} 복습 노트에서 삭제` } });
      removeBtn.addEventListener("click", () => {
        state = updateState((latest) => Core.removeReviewItem(latest, item.contentId)).state;
        render();
      });
      list.append(el("div", { className: "list-item" }, [
        el("div", { className: "list-item-body" }, [
          el("strong", { text: sentence?.english || item.contentId }),
          el("p", { className: "fine-copy small", text: meta }),
        ]),
        isDue ? el("span", { className: "chip gold", text: "오늘" }) : null,
        removeBtn,
      ]));
    });
    container.append(list);
  }

  render();
}

/* ---------- 설정 ---------- */

async function initSettings() {
  const timeInput = $("#popup-time");
  if (!timeInput) return;
  let state = getState();
  if (!requireProfile(state)) return;

  /** 최신 상태에 변경을 적용해 저장 (팝업 창에서 저장한 기록을 덮어쓰지 않게) */
  function commit(mutate) {
    state = updateState(mutate).state;
  }

  const diffSelect = $("#difficulty");
  const dailyPopupToggle = $("#daily-popup-toggle");
  const autoStartToggle = $("#auto-start-toggle");
  const autoLoginToggle = $("#auto-login-toggle");
  const darkToggle = $("#dark-mode-toggle");
  const nicknameInput = $("#settings-nickname");
  const nicknameSave = $("#settings-nickname-save");
  let appInfo = { isPackaged: false };
  let osState = null;

  try {
    appInfo = (await window.mogugeo?.getAppInfo?.()) || appInfo;
    if (appInfo.isPackaged) osState = await window.mogugeo?.getDailyPopup?.();
  } catch (error) {
    console.warn("앱 정보를 읽지 못했습니다.", error);
  }

  // 저장된 설정이 정본이다. OS 조회 결과로 덮어쓰지 않는다.
  timeInput.value = state.settings.popupTime;
  if (diffSelect) diffSelect.value = state.settings.difficulty;
  setSwitchState(dailyPopupToggle, state.settings.dailyPopupEnabled);
  setSwitchState(autoStartToggle, state.settings.autoStart);
  setSwitchState(autoLoginToggle, state.settings.autoLogin);
  setSwitchState(darkToggle, state.darkMode);
  if (nicknameInput) nicknameInput.value = getNickname(state);

  function renderSummary(lastResult) {
    const s = state.settings;
    $("#summary-title").textContent = s.dailyPopupEnabled
      ? `매일 ${formatTimeLabel(s.popupTime)} 데일리 팝업`
      : "데일리 팝업 꺼짐";
    const parts = [
      s.autoStart ? "Windows 시작 시 자동 실행" : "자동 실행 꺼짐",
      s.autoLogin ? "자동 로그인 켜짐" : "자동 로그인 꺼짐",
      `난이도 ${Core.getDifficultyLabel(s.difficulty)}`,
    ];
    $("#summary-copy").textContent = parts.join(" · ");

    const osNote = $("#summary-os");
    if (!appInfo.isPackaged) {
      osNote.textContent = "개발 모드로 실행 중이라 작업 스케줄러와 시작 프로그램에는 반영하지 않습니다. 설치본에서 자동으로 반영됩니다.";
    } else if (lastResult && !lastResult.applied) {
      osNote.textContent = `Windows에 반영하지 못했습니다: ${lastResult.reason || "알 수 없는 오류"}`;
    } else if (osState && osState.available) {
      osNote.textContent = osState.enabled
        ? `작업 스케줄러에 등록됨 (${osState.time ? formatTimeLabel(osState.time) : "시각 확인 불가"})`
        : "작업 스케줄러에 등록된 팝업이 없습니다.";
    } else {
      osNote.textContent = "";
    }
  }

  async function applyDailyPopup() {
    const result = await window.mogugeo?.setDailyPopup?.(state.settings.dailyPopupEnabled, state.settings.popupTime);
    if (appInfo.isPackaged) {
      osState = await window.mogugeo?.getDailyPopup?.();
    }
    renderSummary(result);
  }

  renderSummary();

  timeInput.addEventListener("change", async () => {
    if (!Core.TIME_PATTERN.test(timeInput.value)) {
      setFieldError(timeInput, "시각을 HH:MM 형식으로 입력하세요.");
      return;
    }
    clearFieldError(timeInput);
    commit((draft) => {
      draft.settings.popupTime = timeInput.value;
    });
    await applyDailyPopup();
  });
  // 잘못 지운 채로 벗어나면 저장된 시각으로 되돌린다.
  timeInput.addEventListener("blur", () => {
    if (!Core.TIME_PATTERN.test(timeInput.value)) {
      timeInput.value = state.settings.popupTime;
      clearFieldError(timeInput);
    }
  });

  diffSelect?.addEventListener("change", () => {
    commit((draft) => {
      draft.settings.difficulty = Core.normalizeDifficulty(diffSelect.value);
    });
    renderSummary();
  });

  dailyPopupToggle?.addEventListener("switch-change", async (event) => {
    commit((draft) => {
      draft.settings.dailyPopupEnabled = event.detail.on;
    });
    await applyDailyPopup();
  });

  autoStartToggle?.addEventListener("switch-change", async (event) => {
    commit((draft) => {
      draft.settings.autoStart = event.detail.on;
    });
    const result = await window.mogugeo?.setAutoStart?.(state.settings.autoStart);
    renderSummary(result);
  });

  autoLoginToggle?.addEventListener("switch-change", (event) => {
    commit((draft) => {
      draft.settings.autoLogin = event.detail.on;
    });
    renderSummary();
  });

  darkToggle?.addEventListener("switch-change", (event) => {
    commit((draft) => {
      draft.darkMode = event.detail.on;
    });
    applyDarkMode(state.darkMode);
  });

  nicknameSave?.addEventListener("click", () => {
    const error = Core.validateNickname(nicknameInput.value);
    const status = $("#settings-nickname-status");
    if (error) {
      setFieldError(nicknameInput, error);
      nicknameInput.focus();
      return;
    }
    clearFieldError(nicknameInput);
    commit((draft) => {
      if (draft.profile) draft.profile.nickname = nicknameInput.value.trim();
    });
    renderProfileName(state);
    if (status) status.textContent = "저장했습니다.";
  });
  nicknameInput?.addEventListener("input", () => {
    clearFieldError(nicknameInput);
    const status = $("#settings-nickname-status");
    if (status) status.textContent = "";
  });

  $("#btn-open-popup")?.addEventListener("click", () => {
    if (window.mogugeo?.openPopup) window.mogugeo.openPopup();
    else window.location.href = "popup.html";
  });

  $("#btn-report-issue")?.addEventListener("click", () => {
    window.mogugeo?.openExternal?.(ISSUES_URL);
  });
}

/* ---------- 데일리 팝업 ---------- */

function initPopup() {
  const checkBtn = $("#popup-check");
  if (!checkBtn) return;

  const state = getState();
  const now = new Date();
  const today = now.toDateString();
  const heroCopy = $("#popup-hero-copy");
  const messageEl = $("#popup-message");
  const resultEl = $("#popup-result");
  const resultList = $("#popup-result-list");
  const taskStack = $("#popup-task-stack");

  $("#popup-footer-streak").textContent = `${Core.computeStreak(state.studyLog, now)}일 연속 학습`;
  $("#popup-footer-time").textContent = state.settings.dailyPopupEnabled
    ? `매일 ${formatTimeLabel(state.settings.popupTime)}`
    : "자동 팝업 꺼짐";
  if (state.profile) $("#popup-title").textContent = `${getNickname(state)}님, 오늘의 2문장`;

  function setMessage(message, tone) {
    messageEl.textContent = message;
    messageEl.className = `popup-message small${tone ? ` ${tone}` : ""}`;
  }

  function renderResults(items) {
    resultList.replaceChildren(...items.map((item, index) => el("div", { className: "list-item" }, [
      el("div", { className: "list-item-body" }, [
        el("strong", { className: `result-line ${item.isCorrect ? "pass" : "fail"}` }, [
          icon(item.isCorrect ? "check_circle" : "cancel"),
          el("span", { text: `과제 ${index + 1} · ${item.isCorrect ? "정답" : "복습 필요"}` }),
        ]),
        el("p", { className: "small muted", text: `모범 답안: ${item.correctAnswer || "-"}` }),
        item.hint ? el("p", { className: "small result-hint", text: item.hint }) : null,
      ]),
      el("span", { className: "chip", text: `${item.score}점` }),
    ])));
    resultEl.hidden = false;
  }

  if (state.lastPopupDate === today) {
    heroCopy.textContent = "오늘의 데일리 팝업을 이미 마쳤습니다. 내일 새 문제가 나옵니다.";
    taskStack.hidden = true;
    checkBtn.hidden = true;
    const sentenceMap = getSentenceMap();
    const todays = state.studyLog.filter((entry) => entry.source === "popup" && Core.toDayKey(entry.date) === Core.toDayKey(now));
    if (todays.length) {
      renderResults(todays.map((entry) => {
        const sentence = sentenceMap.get(entry.contentId);
        return {
          score: entry.score,
          isCorrect: entry.isCorrect,
          correctAnswer: entry.direction === "ko-to-en" ? sentence?.english : sentence?.answer,
        };
      }));
    }
    return;
  }

  const picked = Core.pickPopupSentences(state, getSentences(), now);
  const tasks = [
    { sentence: picked[0], direction: "en-to-ko", index: 1 },
    { sentence: picked[1], direction: "ko-to-en", index: 2 },
  ].filter((task) => task.sentence);

  if (!tasks.length) {
    heroCopy.textContent = "문장 데이터를 불러오지 못했습니다.";
    taskStack.hidden = true;
    checkBtn.hidden = true;
    return;
  }

  [1, 2].forEach((index) => {
    const task = tasks.find((item) => item.index === index);
    const card = $(`#popup-task-${index}`);
    if (!task) {
      card.hidden = true;
      return;
    }
    task.input = $(`#popup-answer-${index}`);
    $(`#popup-question-${index}`).textContent = task.direction === "en-to-ko" ? task.sentence.english : task.sentence.answer;
    task.input.value = "";
    task.input.addEventListener("input", () => {
      clearFieldError(task.input);
      setMessage("");
    });
    task.input.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        event.preventDefault();
        if (!checkBtn.disabled) checkBtn.click();
      }
    });
  });

  checkBtn.addEventListener("click", () => {
    let firstEmpty = null;
    tasks.forEach((task) => {
      if (!task.input.value.trim()) {
        setFieldError(task.input, "답을 입력하세요.");
        firstEmpty = firstEmpty || task.input;
      }
    });
    if (firstEmpty) {
      setMessage("두 문제 모두 답을 입력해야 채점할 수 있습니다.", "error");
      firstEmpty.focus();
      return;
    }

    const at = new Date();
    const latest = getState();
    const results = tasks.map((task) => {
      const score = task.direction === "en-to-ko"
        ? Core.scoreKoreanTranslation(task.input.value, task.sentence)
        : Core.scoreEnglishSentence(task.input.value, task.sentence);
      const outcome = Core.submitAnswer(latest, {
        contentId: Core.getSentenceId(task.sentence),
        direction: task.direction,
        score,
        source: "popup",
        now: at,
      });
      task.input.disabled = true;
      return {
        score: outcome.score,
        isCorrect: outcome.isCorrect,
        correctAnswer: task.direction === "en-to-ko" ? task.sentence.answer : task.sentence.english,
        hint: task.direction === "en-to-ko"
          ? Core.getKoreanFormHint(task.input.value, task.sentence)
          : Core.getEnglishFormHint(task.input.value, task.sentence),
      };
    });
    latest.lastPopupDate = today;
    saveState(latest);

    renderResults(results);
    checkBtn.hidden = true;
    heroCopy.textContent = "오늘의 데일리 팝업을 마쳤습니다.";
    const wrong = results.filter((item) => !item.isCorrect).length;
    setMessage(wrong ? `틀린 ${wrong}문장은 복습 노트에 담았습니다. 결과를 저장했습니다.` : "모두 맞혔습니다. 결과를 저장했습니다.", "success");
    $("#popup-footer-streak").textContent = `${Core.computeStreak(latest.studyLog, at)}일 연속 학습`;
    $("#popup-open-main")?.focus();
  });

  $("#popup-answer-1")?.focus();
}

function initPopupLinks() {
  $("#popup-open-main")?.addEventListener("click", (event) => {
    if (window.mogugeo?.showMain) {
      event.preventDefault();
      window.mogugeo.showMain();
    }
  });
}

/* ---------- 시작 ---------- */

async function initializePage() {
  const state = getState();
  applyDarkMode(state.darkMode);
  renderProfileName(state);
  initSwitches();
  initTitlebar();
  initSlideMenu();
  initExternalLinks();
  initPopupLinks();

  await (window.MoGugeoData?.ready || Promise.resolve());

  initLogin();
  initSignup();
  initOnboarding();
  initDashboard();
  initSentence();
  initMyPage();
  await initSettings();
  initPopup();
}

document.addEventListener("DOMContentLoaded", () => {
  initializePage().catch((error) => {
    console.error("모국어 화면 초기화 실패", error);
  });
});
