import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("electron", {
  getPlatform: () => process.platform,
  windowControls: (action: "minimize" | "maximize" | "close") => {
    ipcRenderer.send("window-controls", action);
  },
  setOpacity: (opacity: number) => {
    ipcRenderer.send("set-opacity", opacity);
  },
  checkFlash: () => ipcRenderer.invoke("check-flash"),
  updateBossKey: (key: string) => ipcRenderer.send("update-boss-key", key),
  openExternal: (url: string) => ipcRenderer.send("open-external", url),
  getAppVersion: () => ipcRenderer.invoke("get-app-version"),
  getKeymapConfig: () => ipcRenderer.invoke("get-keymap-config"),
  getFlashPid: () => ipcRenderer.invoke("get-flash-pid"),
  saveKeymapConfig: (config: any) =>
    ipcRenderer.send("save-keymap-config", config),
  suspendBossKey: () => ipcRenderer.send("suspend-boss-key"),
  resumeBossKey: () => ipcRenderer.send("resume-boss-key"),
  suspendKeymap: () => ipcRenderer.send("suspend-keymap"),
  resumeKeymap: () => ipcRenderer.send("resume-keymap"),
  ocr: (imageBase64: string) => ipcRenderer.invoke("perform-ocr", imageBase64),
  ocrGetStatus: () => ipcRenderer.invoke("ocr-get-status"),
  ocrInstall: () => ipcRenderer.invoke("ocr-install"),
  ocrUninstall: () => ipcRenderer.invoke("ocr-uninstall"),
  downloadUpdate: (url: string) => ipcRenderer.invoke("download-update", url),
  onUpdateProgress: (callback: (percent: number) => void) => {
    ipcRenderer.on("update-progress", (_event, percent) => callback(percent));
  },
  offUpdateProgress: () => {
    ipcRenderer.removeAllListeners("update-progress");
  },
  onOcrInstallProgress: (callback: (percent: number) => void) => {
    ipcRenderer.on("ocr-install-progress", (_event, percent) =>
      callback(percent),
    );
  },
  offOcrInstallProgress: () => {
    ipcRenderer.removeAllListeners("ocr-install-progress");
  },

  // Automation API
  automation: {
    startRecord: (name: string) =>
      ipcRenderer.invoke("automation-start-record", name),
    stopRecord: () => ipcRenderer.invoke("automation-stop-record"),
    startPlay: (name: string) =>
      ipcRenderer.invoke("automation-start-play", name),
    stopPlay: () => ipcRenderer.invoke("automation-stop-play"),
    listScripts: () => ipcRenderer.invoke("automation-list-scripts"),
    deleteScript: (name: string) =>
      ipcRenderer.invoke("automation-delete-script", name),
    saveConfig: (name: string, config: any) =>
      ipcRenderer.invoke("automation-save-config", name, config),
    getConfig: (name: string) =>
      ipcRenderer.invoke("automation-get-config", name),
    saveScript: (name: string, events: any[]) =>
      ipcRenderer.invoke("automation-save-script", name, events),
    onStatus: (callback: (status: string) => void) => {
      const listener = (_event: Electron.IpcRendererEvent, status: string) => {
        callback(status);
      };
      ipcRenderer.on("automation-status", listener);
      return () => {
        ipcRenderer.removeListener("automation-status", listener);
      };
    },
    offStatus: () => {
      ipcRenderer.removeAllListeners("automation-status");
    },
    onBreakpointTriggered: (
      callback: (payload: { tTrigger: number }) => void,
    ) => {
      ipcRenderer.on("automation-breakpoint-triggered", (_event, payload) =>
        callback(payload ?? { tTrigger: 0 }),
      );
    },
    offBreakpointTriggered: () => {
      ipcRenderer.removeAllListeners("automation-breakpoint-triggered");
    },
    breakpointResume: (data: {
      x: number;
      y: number;
      w: number;
      h: number;
      text: string;
      tTrigger?: number;
    }) => ipcRenderer.invoke("automation-breakpoint-resume", data),
    getScriptEvents: (name: string) =>
      ipcRenderer.invoke("automation-get-script-events", name),
    getScreenshot: () => ipcRenderer.invoke("automation-get-screenshot"),
    onOCRRequest: (
      callback: (data: {
        requestId: string;
        screenshotData: string;
        region: { x: number; y: number; w: number; h: number };
        expectedText: string;
      }) => void,
    ) => {
      ipcRenderer.on("automation-ocr-request", (_event, data) =>
        callback(data),
      );
    },
    ocrResponse: (data: {
      requestId: string;
      text: string;
      matched: boolean;
    }) => {
      ipcRenderer.send("automation-ocr-response", data);
    },
    offOCRRequest: () => {
      ipcRenderer.removeAllListeners("automation-ocr-request");
    },
  },

  // Speed Gear API
  speed: {
    start: () => ipcRenderer.invoke("speed-start"),
    stop: () => ipcRenderer.invoke("speed-stop"),
    setSpeed: (multiplier: number) =>
      ipcRenderer.invoke("speed-set", multiplier),
    getStatus: () => ipcRenderer.invoke("speed-status"),
  },
});
