import { app, ipcMain } from "electron";
import path from "path";
import fs from "fs";
import os from "os";
import { spawn } from "child_process";
import { execFileSync } from "child_process";

export interface KeymapConfig {
  enabled: boolean;
  mappings: Array<{ source: string; target: string }>;
}

export class ConfigManager {
  private configDir: string;
  private configPath: string;
  private ahkProcess: any = null;

  private readonly macKeyMap: Record<string, number> = {
    A: 0x04,
    B: 0x05,
    C: 0x06,
    D: 0x07,
    E: 0x08,
    F: 0x09,
    G: 0x0a,
    H: 0x0b,
    I: 0x0c,
    J: 0x0d,
    K: 0x0e,
    L: 0x0f,
    M: 0x10,
    N: 0x11,
    O: 0x12,
    P: 0x13,
    Q: 0x14,
    R: 0x15,
    S: 0x16,
    T: 0x17,
    U: 0x18,
    V: 0x19,
    W: 0x1a,
    X: 0x1b,
    Y: 0x1c,
    Z: 0x1d,
    1: 0x1e,
    2: 0x1f,
    3: 0x20,
    4: 0x21,
    5: 0x22,
    6: 0x23,
    7: 0x24,
    8: 0x25,
    9: 0x26,
    0: 0x27,
    SPACE: 0x2c,
    ENTER: 0x28,
    Numpad0: 0x62,
    Numpad1: 0x59,
    Numpad2: 0x5a,
    Numpad3: 0x5b,
    Numpad4: 0x5c,
    Numpad5: 0x5d,
    Numpad6: 0x5e,
    Numpad7: 0x5f,
    Numpad8: 0x60,
    Numpad9: 0x61,
  };

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

  private toMacUsage(key: string): number | null {
    if (!key) return null;
    const k = key.trim();
    const byRaw = this.macKeyMap[k];
    if (typeof byRaw === "number") return byRaw;
    const byUpper = this.macKeyMap[k.toUpperCase()];
    if (typeof byUpper === "number") return byUpper;
    return null;
  }

  private applyMacKeymap(config: KeymapConfig): void {
    const mappings = config.enabled
      ? config.mappings
          .map((mapping) => {
            const source = this.toMacUsage(mapping.source);
            const target = this.toMacUsage(mapping.target);
            if (source === null || target === null) {
              return null;
            }
            return {
              HIDKeyboardModifierMappingSrc: 0x700000000 + source,
              HIDKeyboardModifierMappingDst: 0x700000000 + target,
            };
          })
          .filter(Boolean)
      : [];

    const payload = JSON.stringify({ UserKeyMapping: mappings });
    execFileSync("/usr/bin/hidutil", ["property", "--set", payload]);
  }

  startAHK(): void {
    if (process.platform === "darwin") {
      this.ensureDefaultConfig();
      try {
        const content = fs.readFileSync(this.configPath, "utf-8");
        const config = this.parseIni(content);
        this.applyMacKeymap(config);
      } catch (err) {
        console.error("Failed to apply macOS keymap via hidutil:", err);
      }
      return;
    }

    if (process.platform !== "win32") {
      console.log("Keymap runtime is not available on this platform.");
      return;
    }

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
    if (process.platform === "darwin") {
      try {
        this.applyMacKeymap({ enabled: false, mappings: [] });
      } catch (err) {
        console.error("Failed to suspend macOS keymap:", err);
      }
      return;
    }

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
    if (process.platform === "darwin") {
      try {
        this.applyMacKeymap({ enabled: false, mappings: [] });
      } catch (err) {
        console.error("Failed to cleanup macOS keymap:", err);
      }
      return;
    }

    if (this.ahkProcess) {
      this.ahkProcess.kill();
      this.ahkProcess = null;
    }
  }
}
