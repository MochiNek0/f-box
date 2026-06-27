import { app, ipcMain } from "electron";
import path from "path";
import fs from "fs";
import os from "os";
import { spawn } from "child_process";

export interface KeymapConfig {
  enabled: boolean;
  mappings: Array<{ source: string; target: string }>;
}

export class ConfigManager {
  private configDir: string;
  private configPath: string;
  private ahkProcess: any = null;
  private ahkErrorHandler: ((err: any) => void) | null = null;
  private saveKeymapHandler: ((_event: any, config: KeymapConfig) => void) | null = null;
  private suspendKeymapHandler: (() => void) | null = null;
  private resumeKeymapHandler: (() => void) | null = null;

  constructor() {
    this.configDir = path.join(os.homedir(), ".f-box");
    this.configPath = path.join(this.configDir, "keymap.ini");
  }

  ensureDefaultConfig(): void {
    if (!fs.existsSync(this.configDir)) {
      fs.mkdirSync(this.configDir, { recursive: true });
    }

    if (!fs.existsSync(this.configPath)) {
      const defaultConfig = `[Settings]
enabled=1

[Mappings]
1 = Numpad1
2 = Numpad2
3 = Numpad3
4 = Numpad4
5 = Numpad5
6 = Numpad6
7 = Numpad7
8 = Numpad8
9 = Numpad9
0 = Numpad0`;
      fs.writeFileSync(this.configPath, defaultConfig.trim());
    }
  }

  parseIni(content: string): KeymapConfig {
    const lines = content.split(/\r?\n/);
    let enabled = true;
    const mappings: Array<{ source: string; target: string }> = [];
    let currentSection = "";

    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
        currentSection = trimmed.slice(1, -1);
      } else if (trimmed.includes("=") && !trimmed.startsWith(";")) {
        const pos = trimmed.indexOf("=");
        const key = trimmed.slice(0, pos).trim();
        const value = trimmed.slice(pos + 1).trim();
        if (currentSection === "Settings" && key === "enabled") {
          enabled = value === "1";
        } else if (currentSection === "Mappings") {
          if (key && value) {
            mappings.push({ source: key, target: value });
          }
        }
      }
    }

    return { enabled, mappings };
  }

  generateIni(enabled: boolean, mappings: Array<{ source: string; target: string }>): string {
    let content = `[Settings]\nenabled=${enabled ? "1" : "0"}\n\n[Mappings]\n`;
    for (const m of mappings) {
      content += `${m.source} = ${m.target}\n`;
    }
    return content.trim();
  }

  startAHK(): void {
    // Only support keymap on Windows
    if (process.platform !== "win32") {
      console.log("Keymap (AHK) is only supported on Windows");
      return;
    }

    if (this.ahkProcess) {
      this.ahkProcess.kill();
      this.ahkProcess = null;
    }

    let enabled: boolean;
    try {
      const content = fs.readFileSync(this.configPath, "utf-8");
      ({ enabled } = this.parseIni(content));
    } catch (e) {
      console.error("无法读取键位映射配置，跳过启动 AHK:", e);
      return;
    }
    if (!enabled) return;

    const ahkPath = app.isPackaged
      ? path.join(process.resourcesPath, "keymap.exe")
      : path.join(__dirname, "..", "public", "assets", "keymap.exe");

    if (!fs.existsSync(ahkPath)) {
      console.warn("keymap.exe 未找到，无法启动键盘映射");
      return;
    }

    // Kill any previous AHK process before spawning a new one
    this.killAHK();

    this.ahkProcess = spawn(ahkPath, [this.configPath, process.pid.toString()]);
    this.ahkErrorHandler = (err: any) => {
      console.error("AHK 启动失败:", err);
    };
    this.ahkProcess.on("error", this.ahkErrorHandler);
  }

  suspendKeymap(): void {
    if (this.ahkProcess) {
      this.ahkProcess.kill();
      this.ahkProcess = null;
      console.log("Keymap (AHK) suspended");
    }
  }

  resumeKeymap(): void {
    this.startAHK();
    console.log("Keymap (AHK) resumed");
  }

  getConfig(): KeymapConfig {
    this.ensureDefaultConfig();
    const content = fs.readFileSync(this.configPath, "utf-8");
    return this.parseIni(content);
  }

  saveConfig(config: KeymapConfig): void {
    const content = this.generateIni(config.enabled, config.mappings);
    fs.writeFileSync(this.configPath, content);
    this.startAHK();
  }

  setupIPCHandlers(): void {
    // Get keymap config
    ipcMain.handle("get-keymap-config", () => {
      return this.getConfig();
    });

    // Save keymap config
    this.saveKeymapHandler = (_event, config: KeymapConfig) => {
      this.saveConfig(config);
    };
    ipcMain.on("save-keymap-config", this.saveKeymapHandler);

    // Suspend/Resume Keymap
    this.suspendKeymapHandler = () => {
      this.suspendKeymap();
    };
    ipcMain.on("suspend-keymap", this.suspendKeymapHandler);

    this.resumeKeymapHandler = () => {
      this.resumeKeymap();
    };
    ipcMain.on("resume-keymap", this.resumeKeymapHandler);
  }

  killAHK(): void {
    if (this.ahkProcess) {
      if (this.ahkErrorHandler) {
        this.ahkProcess.removeListener("error", this.ahkErrorHandler);
        this.ahkErrorHandler = null;
      }
      try {
        this.ahkProcess.kill();
      } catch (e) {
        // ignore
      }
      this.ahkProcess = null;
    }
  }

  cleanupIPCHandlers(): void {
    ipcMain.removeHandler("get-keymap-config");
    if (this.saveKeymapHandler) {
      ipcMain.removeListener("save-keymap-config", this.saveKeymapHandler);
      this.saveKeymapHandler = null;
    }
    if (this.suspendKeymapHandler) {
      ipcMain.removeListener("suspend-keymap", this.suspendKeymapHandler);
      this.suspendKeymapHandler = null;
    }
    if (this.resumeKeymapHandler) {
      ipcMain.removeListener("resume-keymap", this.resumeKeymapHandler);
      this.resumeKeymapHandler = null;
    }
  }
}
