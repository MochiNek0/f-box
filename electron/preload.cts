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

  // Automation API
  automation: {
    startRecord: (name: string) =>
      ipcRenderer.invoke("automation-start-record", name),
    stopRecord: () => ipcRenderer.invoke("automation-stop-record"),
    startPlay: (name: string) =>
      ipcRenderer.invoke("automation-start-play", name),
    stopPlay: () => ipcRenderer.invoke("automation-stop-play"),
    pickColor: () => ipcRenderer.invoke("automation-pick-color"),
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
  },
});
