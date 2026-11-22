import { app } from "electron";
import { execFile } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { buildDailyPopupTaskXml, parseTaskTime } from "./taskXml";

const TASK_NAME = "MoGugeo Daily Popup";
const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;

export type DailyPopupTaskState = {
  /** false 면 OS 상태를 조회하지 않았다(개발 모드) */
  available: boolean;
  enabled: boolean;
  time: string | null;
};

export type ApplyResult = {
  applied: boolean;
  reason?: string;
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

async function createTaskFromXml(time: string): Promise<void> {
  const xmlPath = path.join(os.tmpdir(), `mogugeo-daily-popup-${process.pid}.xml`);
  // schtasks 는 UTF-16 LE(BOM) XML 을 가장 안정적으로 읽는다.
  fs.writeFileSync(xmlPath, `﻿${buildDailyPopupTaskXml(process.execPath, time)}`, "utf16le");
  try {
    await runSchtasks(["/create", "/f", "/tn", TASK_NAME, "/xml", xmlPath]);
  } finally {
    fs.promises.unlink(xmlPath).catch(() => undefined);
  }
}

async function createTaskSimple(time: string): Promise<void> {
  await runSchtasks([
    "/create", "/f", "/tn", TASK_NAME, "/sc", "daily", "/st", time,
    "/tr", `"${process.execPath}" --popup`,
  ]);
}

/**
 * 설정값대로 작업 스케줄러를 맞춘다.
 * 개발 모드(npm start)에서는 electron.exe 경로가 등록되지 않도록 아무것도 하지 않는다.
 */
export async function setDailyPopupTask(enabled: boolean, time: string): Promise<ApplyResult> {
  if (!TIME_PATTERN.test(time)) {
    return { applied: false, reason: "invalid-time" };
  }

  if (!app.isPackaged) {
    console.log(`[scheduler] development mode: not touching Task Scheduler (enabled=${enabled}, time=${time})`);
    return { applied: false, reason: "development" };
  }

  if (!enabled) {
    try {
      await runSchtasks(["/delete", "/tn", TASK_NAME, "/f"]);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      // 작업이 원래 없으면 성공으로 본다.
      if (!/cannot find|찾을 수 없/i.test(message)) {
        return { applied: false, reason: message };
      }
    }
    return { applied: true };
  }

  try {
    await createTaskFromXml(time);
  } catch (xmlError) {
    console.warn("[scheduler] XML registration failed, falling back to /sc daily.", xmlError);
    try {
      await createTaskSimple(time);
    } catch (error) {
      return { applied: false, reason: error instanceof Error ? error.message : String(error) };
    }
  }
  return { applied: true };
}

export async function getDailyPopupTask(): Promise<DailyPopupTaskState> {
  if (!app.isPackaged) {
    return { available: false, enabled: false, time: null };
  }

  try {
    const output = await runSchtasks(["/query", "/tn", TASK_NAME, "/xml"]);
    return { available: true, enabled: true, time: parseTaskTime(output) };
  } catch {
    return { available: true, enabled: false, time: null };
  }
}
