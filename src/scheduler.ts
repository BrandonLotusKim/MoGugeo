import { app } from "electron";
import { execFile } from "node:child_process";

const TASK_NAME = "MoGugeo Daily Popup";
const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;

type DailyPopupTaskState = {
  enabled: boolean;
  time: string | null;
};

function runSchtasks(args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile("schtasks", args, { windowsHide: true }, (error, stdout, stderr) => {
      if (error) {
        reject(new Error(stderr || error.message));
        return;
      }
      resolve(stdout);
    });
  });
}

function isValidTime(time: string): boolean {
  return TIME_PATTERN.test(time);
}

export async function setDailyPopupTask(enabled: boolean, time: string): Promise<void> {
  if (!isValidTime(time)) {
    return;
  }

  if (!app.isPackaged) {
    console.log(`[scheduler] Skipping schtasks in development mode: enabled=${enabled}, time=${time}`);
    return;
  }

  if (!enabled) {
    try {
      await runSchtasks(["/delete", "/tn", TASK_NAME, "/f"]);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (!message.toLowerCase().includes("cannot find")) {
        throw error;
      }
    }
    return;
  }

  const taskCommand = `"${process.execPath}" --popup`;
  await runSchtasks([
    "/create",
    "/f",
    "/tn",
    TASK_NAME,
    "/sc",
    "daily",
    "/st",
    time,
    "/tr",
    taskCommand,
  ]);
}

export async function getDailyPopupTask(): Promise<DailyPopupTaskState> {
  if (!app.isPackaged) {
    console.log("[scheduler] Skipping schtasks query in development mode.");
    return { enabled: false, time: null };
  }

  try {
    const output = await runSchtasks(["/query", "/tn", TASK_NAME, "/xml"]);
    const match = output.match(/<StartBoundary>.*T(\d{2}:\d{2}):\d{2}<\/StartBoundary>/);
    return {
      enabled: true,
      time: match?.[1] ?? null,
    };
  } catch {
    return { enabled: false, time: null };
  }
}
