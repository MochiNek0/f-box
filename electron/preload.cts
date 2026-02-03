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
});
