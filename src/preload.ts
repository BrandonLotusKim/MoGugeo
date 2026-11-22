import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("mogugeo", {
  openPopup: () => ipcRenderer.invoke("open-popup"),
  openExternal: (url: string) => ipcRenderer.invoke("open-external", url),
  setDailyPopup: (enabled: boolean, time: string) =>
    ipcRenderer.invoke("set-daily-popup", { enabled, time }),
  getDailyPopup: () => ipcRenderer.invoke("get-daily-popup"),
  setAutoStart: (enabled: boolean) => ipcRenderer.invoke("set-auto-start", enabled),
  getAutoStart: () => ipcRenderer.invoke("get-auto-start"),
  minimizeToTray: () => ipcRenderer.invoke("minimize-to-tray"),
  expandWindow: () => ipcRenderer.invoke("expand-window"),
  windowMinimize: () => ipcRenderer.invoke("window-minimize"),
  windowMaximize: () => ipcRenderer.invoke("window-maximize"),
  windowClose: () => ipcRenderer.invoke("window-close"),
  shrinkWindow: () => ipcRenderer.invoke("shrink-window"),
  showMain: () => ipcRenderer.invoke("show-main"),
  getAppInfo: () => ipcRenderer.invoke("get-app-info"),
});
