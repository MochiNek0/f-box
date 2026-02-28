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
    if (this.ahkProcess) {
      this.ahkProcess.kill();
      this.ahkProcess = null;
    }

    const content = fs.readFileSync(this.configPath, "utf-8");
    const { enabled } = this.parseIni(content);
    if (!enabled) return;

    const ahkPath = app.isPackaged
      ? path.join(process.resourcesPath, "keymap.exe")
      : path.join(__dirname, "..", "public", "assets", "keymap.exe");

    if (!fs.existsSync(ahkPath)) {
      console.warn("keymap.exe 未找到，无法启动键盘映射");
      return;
    }

    this.ahkProcess = spawn(ahkPath, [this.configPath, process.pid.toString()]);
    this.ahkProcess.on("error", (err: any) => {
      console.error("AHK 启动失败:", err);
    });
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
    ipcMain.on(
      "save-keymap-config",
      (_event, config: KeymapConfig) => {
        this.saveConfig(config);
      },
    );

    // Suspend/Resume Keymap
    ipcMain.on("suspend-keymap", () => {
      this.suspendKeymap();
    });

    ipcMain.on("resume-keymap", () => {
      this.resumeKeymap();
    });
  }

  killAHK(): void {
    if (this.ahkProcess) {
      this.ahkProcess.kill();
      this.ahkProcess = null;
    }
  }
}
