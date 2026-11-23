import { app, BrowserWindow, Tray, Menu, ipcMain, nativeImage, powerMonitor, shell } from "electron";
import path from "node:path";
import { getDailyPopupTask, setDailyPopupTask } from "./scheduler";
import { speakEnglish } from "./speech";
import { scoreWithGemini } from "./aiScore";

let mainWindow: BrowserWindow | null = null;
let popupWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
const isPopupMode = process.argv.includes("--popup");
const timePattern = /^([01]\d|2[0-3]):([0-5]\d)$/;
const allowedExpandTargets = new Set(["dashboard.html"]);

function isValidTimeString(value: unknown): value is string {
  return typeof value === "string" && timePattern.test(value);
}

function isBoolean(value: unknown): value is boolean {
  return typeof value === "boolean";
}

function isAllowedExternalUrl(value: unknown): value is string {
  return typeof value === "string"
    && (value.startsWith("https://") || value.startsWith("mailto:"));
}

function isDailyPopupPayload(
  payload: unknown,
): payload is { enabled: boolean; time: string } {
  if (!payload || typeof payload !== "object") {
    return false;
  }

  const { enabled, time } = payload as {
    enabled?: unknown;
    time?: unknown;
  };

  return isBoolean(enabled) && isValidTimeString(time);
}

function resolveExpandTarget(target: unknown): string {
  if (typeof target !== "string") {
    return "dashboard.html";
  }

  const normalizedTarget = path.posix.basename(target);
  return allowedExpandTargets.has(normalizedTarget)
    ? normalizedTarget
    : "dashboard.html";
}

// 개발 환경과 패키징 환경별 아이콘 위치 분기 처리
function resolveAppIcon(): string {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, "app-logo.ico");
  }
  return path.join(app.getAppPath(), "build", "app-logo.ico");
}

// preload 스크립트 경로 (컴파일 후 dist/preload.js)
function resolvePreload(): string {
  return path.join(__dirname, "preload.js");
}

// 앱 메인 브라우저 창 생성
function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 460,
    height: 615,
    minWidth: 460,
    minHeight: 615,
    resizable: false,
    frame: false,
    transparent: true,
    autoHideMenuBar: true,
    icon: resolveAppIcon(),
    webPreferences: {
      contextIsolation: true,
      preload: resolvePreload(),
      nodeIntegration: false,
      sandbox: false, // preload uses ipcRenderer
      webSecurity: true,
    },
  });

  mainWindow.loadFile(path.join(__dirname, "../src/renderer/main.html"));

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
}

// 데일리 팝업 전용 소형 윈도우 생성
function createPopupWindow(): void {
  if (popupWindow) {
    if (popupWindow.isMinimized()) popupWindow.restore();
    popupWindow.show();
    popupWindow.focus();
    return;
  }

  popupWindow = new BrowserWindow({
    width: 520,
    height: 700,
    resizable: false,
    autoHideMenuBar: true,
    icon: resolveAppIcon(),
    alwaysOnTop: true,
    webPreferences: {
      contextIsolation: true,
      preload: resolvePreload(),
      nodeIntegration: false,
      sandbox: false, // preload uses ipcRenderer
      webSecurity: true,
    },
  });

  popupWindow.setMenuBarVisibility(false);
  popupWindow.loadFile(path.join(__dirname, "../src/renderer/popup.html"));

  popupWindow.on("closed", () => {
    popupWindow = null;
  });
}

function showMainWindow(): void {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
  } else {
    createWindow();
  }
}

// 시스템 트레이 아이콘 및 컨텍스트 메뉴 생성
function createTray(): void {
  const icon = nativeImage.createFromPath(resolveAppIcon());
  tray = new Tray(icon.resize({ width: 16, height: 16 }));
  tray.setToolTip("모국어");

  const contextMenu = Menu.buildFromTemplate([
    {
      label: "모국어 열기",
      click: showMainWindow,
    },
    {
      label: "데일리 팝업 열기",
      click: createPopupWindow,
    },
    { type: "separator" },
    {
      label: "종료",
      click: () => app.quit(),
    },
  ]);

  tray.setContextMenu(contextMenu);

  tray.on("double-click", showMainWindow);
}

// IPC 핸들러: 로그아웃 시 프레임리스 로그인 창으로 전환
ipcMain.handle("shrink-window", () => {
  isTransitioning = true;
  if (mainWindow) {
    mainWindow.destroy();
    mainWindow = null;
  }
  createWindow();
  isTransitioning = false;
});

// IPC 핸들러: 커스텀 타이틀바 창 컨트롤 (요청을 보낸 창 기준)
ipcMain.handle("window-minimize", (event) => {
  BrowserWindow.fromWebContents(event.sender)?.minimize();
});

ipcMain.handle("window-close", (event) => {
  BrowserWindow.fromWebContents(event.sender)?.close();
});

ipcMain.handle("window-maximize", (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (!win) return;
  if (win.isMaximized()) {
    win.unmaximize();
  } else {
    win.maximize();
  }
});

// IPC 핸들러: 팝업에서 메인 창(대시보드 또는 로그인) 열기
ipcMain.handle("show-main", () => {
  showMainWindow();
});

ipcMain.handle("get-app-info", () => {
  return { isPackaged: app.isPackaged, version: app.getVersion() };
});

// IPC 핸들러: 브라우저에 영어 음성이 없을 때 Windows 음성으로 읽기
ipcMain.handle("speak-english", (_event, text: unknown) => speakEnglish(text));
ipcMain.handle("ai-score", (_event, payload: unknown) => scoreWithGemini(payload));

// IPC 핸들러: 렌더러에서 팝업 열기 요청
ipcMain.handle("open-popup", () => {
  createPopupWindow();
});

ipcMain.handle("set-daily-popup", (_event, payload: unknown) => {
  if (!isDailyPopupPayload(payload)) {
    return;
  }

  const { enabled, time } = payload;
  return setDailyPopupTask(enabled, time);
});

ipcMain.handle("get-daily-popup", () => {
  return getDailyPopupTask();
});

ipcMain.handle("set-auto-start", (_event, enabled: unknown) => {
  if (!isBoolean(enabled)) {
    return { applied: false, reason: "invalid" };
  }
  // 개발 모드에서는 electron.exe 가 시작 프로그램에 등록되지 않게 한다.
  if (!app.isPackaged) {
    return { applied: false, reason: "development" };
  }
  app.setLoginItemSettings({ openAtLogin: enabled });
  return { applied: true };
});

ipcMain.handle("get-auto-start", () => {
  if (!app.isPackaged) {
    return null;
  }
  return app.getLoginItemSettings().openAtLogin;
});

ipcMain.handle("open-external", (_event, url: unknown) => {
  if (!isAllowedExternalUrl(url)) {
    return;
  }

  return shell.openExternal(url);
});

// IPC 핸들러: 렌더러에서 트레이로 최소화 요청
ipcMain.handle("minimize-to-tray", () => {
  if (mainWindow) mainWindow.hide();
});

// IPC 핸들러: 로그인 성공 후 프레임 있는 큰 창으로 전환
ipcMain.handle("expand-window", (_event, target: unknown) => {
  isTransitioning = true;
  if (mainWindow) {
    mainWindow.destroy();
    mainWindow = null;
  }

  const targetPage = resolveExpandTarget(target);

  mainWindow = new BrowserWindow({
    width: 1180,
    height: 860,
    minWidth: 1100,
    minHeight: 820,
    frame: false,
    autoHideMenuBar: true,
    icon: resolveAppIcon(),
    webPreferences: {
      contextIsolation: true,
      preload: resolvePreload(),
      nodeIntegration: false,
      sandbox: false, // preload uses ipcRenderer
      webSecurity: true,
    },
  });

  mainWindow.loadFile(path.join(__dirname, "../src/renderer", targetPage));

  mainWindow.on("closed", () => {
    mainWindow = null;
  });
  isTransitioning = false;
});

// 단일 인스턴스: 앱이 켜져 있을 때 작업 스케줄러가 --popup 으로 실행되면
// 새 프로세스를 띄우지 않고 기존 프로세스에서 팝업만 연다.
const hasInstanceLock = app.requestSingleInstanceLock();
if (!hasInstanceLock) {
  app.quit();
}

app.on("second-instance", (_event, argv) => {
  if (argv.includes("--popup")) {
    createPopupWindow();
  } else {
    showMainWindow();
  }
});

app.whenReady().then(() => {
  if (!hasInstanceLock) return;
  app.setAppUserModelId("com.brandonlotuskim.mogugeo");
  if (isPopupMode) {
    createPopupWindow();
  } else {
    createWindow();
  }
  createTray();

  powerMonitor.on("resume", () => {
    console.log("System resumed from sleep.");
  });

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      if (isPopupMode) {
        createPopupWindow();
      } else {
        createWindow();
      }
    }
  });
});

let isTransitioning = false;

app.on("window-all-closed", () => {
  if (process.platform !== "darwin" && !isTransitioning) {
    app.quit();
  }
});
