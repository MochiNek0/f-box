import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("electron", {
  windowControls: (action: "minimize" | "maximize" | "close") => {
    ipcRenderer.send("window-controls", action);
  },
  setOpacity: (opacity: number) => {
    ipcRenderer.send("set-opacity", opacity);
  },
  checkFlash: () => ipcRenderer.invoke("check-flash"),
  updateBossKey: (key: string) => ipcRenderer.send("update-boss-key", key),
  openExternal: (url: string) => ipcRenderer.send("open-external", url),
  getKeymapConfig: () => ipcRenderer.invoke("get-keymap-config"),
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
    onStatus: (callback: (status: string) => void) => {
      ipcRenderer.on("automation-status", (_event, status) => callback(status));
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
});
