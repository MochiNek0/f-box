import {
  app,
  BrowserWindow,
  ipcMain,
  shell,
} from "electron";
import path from "path";
import fs from "fs";
import { spawn, ChildProcess } from "child_process";
import { OcrManager } from "./ocr.cjs";

export interface AutomationOcrRequest {
  requestId: string;
  screenshotData: string;
  region: { x: number; y: number; w: number; h: number };
  expectedText: string;
}

export interface BreakpointData {
  x: number;
  y: number;
  w: number;
  h: number;
  text: string;
  tTrigger?: number;
}

export class AutomationManager {
  private mainWindow: () => BrowserWindow | null;
  private ocrManager: OcrManager | null;
  private automationProcess: ChildProcess | null = null;
  private currentRecordingScriptPath: string | null = null;
  private currentPlayingScriptPath: string | null = null;
  private scriptsDir: string;
  private scriptsConfigDir: string;
  private stdoutBuffer = "";

  constructor(
    getWindow: () => BrowserWindow | null,
    ocrManager: OcrManager | null,
  ) {
    this.mainWindow = getWindow;
    this.ocrManager = ocrManager;

    const configDir = path.join(app.getPath("home"), ".f-box");
    this.scriptsDir = path.join(configDir, "scripts");
    this.scriptsConfigDir = path.join(configDir, "scripts_config");
  }

  private getAutomationRuntime(): { exe: string; args: string[] } {
    const exePath = app.isPackaged
      ? path.join(process.resourcesPath, "automation.exe")
      : path.join(__dirname, "..", "public", "assets", "automation.exe");

    console.log("Using Automation EXE:", exePath);
    return { exe: exePath, args: [] };
  }

  private ensureScriptDirs(): void {
    if (!fs.existsSync(this.scriptsDir)) {
      fs.mkdirSync(this.scriptsDir, { recursive: true });
    }
    if (!fs.existsSync(this.scriptsConfigDir)) {
      fs.mkdirSync(this.scriptsConfigDir, { recursive: true });
    }
  }

  private killAutomationProcess(): void {
    if (this.automationProcess && !this.automationProcess.killed) {
      try {
        this.automationProcess.kill();
      } catch (e) {
        // ignore
      }
      this.automationProcess = null;
    }
  }

  private async handlePlaybackOCRRequest(line: string): Promise<void> {
    // Format: REQ|OCR|<requestId>|<index>|<x>|<y>|<w>|<h>|<text>
    const parts = line.split("|");
    const requestId = parts[2];
    const index = parts[3];
    const x = parseInt(parts[4]);
    const y = parseInt(parts[5]);
    const w = parseInt(parts[6]);
    const h = parseInt(parts[7]);
    const expectedText = parts.slice(8).join("|");

    console.log(
      `Playback OCR Request [id=${requestId}]: Expected "${expectedText}" at (${x},${y},${w},${h})`,
    );

    try {
      if (!this.mainWindow()) return;
      const image = await this.mainWindow()!.webContents.capturePage();
      const imgBuffer = image.toPNG();

      const screenshotData =
        "data:image/png;base64," + imgBuffer.toString("base64");

      // Request OCR from Renderer
      this.mainWindow()?.webContents.send("automation-ocr-request", {
        requestId,
        screenshotData,
        region: { x, y, w, h },
        expectedText,
      });
    } catch (e) {
      console.error("Playback OCR Request Error:", e);
      if (this.currentPlayingScriptPath) {
        fs.writeFileSync(
          `${this.currentPlayingScriptPath}.continue_${requestId}`,
          "",
        );
      }
      this.mainWindow()?.webContents.send(
        "automation-status",
        `STATUS|OCR_RESULT|${requestId}|0|OCR_REQUEST_FAILED`,
      );
    }
  }

  private setupProcessHandlers(): void {
    if (!this.automationProcess) return;

    this.stdoutBuffer = "";

    this.automationProcess.stdout?.on("data", (data: Buffer) => {
      this.stdoutBuffer += data.toString();

      const lines = this.stdoutBuffer.split(/\r?\n/);
      this.stdoutBuffer = lines.pop() ?? "";

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) {
          continue;
        }

        if (trimmed.startsWith("SIGNAL|BREAKPOINT_REQ")) {
          // Check if OCR is installed
          if (this.ocrManager && this.ocrManager.isInstalled()) {
            const parts = trimmed.split("|");
            const tTrigger = parts.length >= 3 ? parseFloat(parts[2]) : 0;
            this.mainWindow()?.webContents.send("automation-breakpoint-triggered", {
              tTrigger,
            });
          } else {
            console.warn("OCR plugin not installed, ignoring F9 request");
            this.mainWindow()?.webContents.send(
              "automation-status",
              "STATUS|OCR_NOT_INSTALLED",
            );
          }
        } else if (trimmed.startsWith("REQ|OCR|")) {
          this.handlePlaybackOCRRequest(trimmed).catch(console.error);
        } else {
          this.mainWindow()?.webContents.send("automation-status", trimmed);
        }
      }
    });

    this.automationProcess.stderr?.on("data", (data: Buffer) => {
      console.error("Automation stderr:", data.toString());
    });

    this.automationProcess.on("exit", () => {
      this.automationProcess = null;
      this.stdoutBuffer = "";
      this.mainWindow()?.webContents.send("automation-status", "STATUS|PROCESS_EXIT");
    });
  }

  async startRecord(name: string): Promise<{ success: boolean; error?: string }> {
    this.ensureScriptDirs();
    this.killAutomationProcess();
    const scriptPath = path.join(this.scriptsDir, `${name}.json`);
    this.currentRecordingScriptPath = scriptPath;

    try {
      const runtime = this.getAutomationRuntime();
      if (!fs.existsSync(runtime.exe)) {
        return { success: false, error: "未找到运行环境" };
      }

      const args = [...runtime.args, "record", scriptPath];
      this.automationProcess = spawn(runtime.exe, args, {
        windowsHide: true,
        stdio: ["ignore", "pipe", "pipe"],
      });

      this.setupProcessHandlers();

      return { success: true };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  }

  async saveScript(
    name: string,
    events: any[],
  ): Promise<{ success: boolean; error?: string }> {
    this.ensureScriptDirs();
    const scriptPath = path.join(this.scriptsDir, `${name}.json`);
    try {
      fs.writeFileSync(scriptPath, JSON.stringify(events, null, 2), "utf-8");
      return { success: true };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  }

  async stopRecord(): Promise<{ success: boolean }> {
    if (this.currentRecordingScriptPath) {
      const stopFile = this.currentRecordingScriptPath + ".stop";
      try {
        fs.writeFileSync(stopFile, "");
        await new Promise((resolve) => setTimeout(resolve, 500));
      } catch (e) {
        console.error("Error creating stop signal:", e);
      }
    }
    this.killAutomationProcess();
    this.currentRecordingScriptPath = null;
    return { success: true };
  }

  async startPlay(name: string): Promise<{ success: boolean; error?: string }> {
    this.ensureScriptDirs();

    const scriptPath = path.join(this.scriptsDir, `${name}.json`);
    if (!fs.existsSync(scriptPath)) {
      return { success: false, error: "脚本文件不存在" };
    }

    const configPath = path.join(this.scriptsConfigDir, `${name}.json`);
    let repeatCount = 0;
    try {
      if (fs.existsSync(configPath)) {
        const config = JSON.parse(fs.readFileSync(configPath, "utf-8"));
        repeatCount = config.repeatCount || 0;
      }
    } catch (e) {
      console.error("Error reading config for play:", e);
    }

    this.killAutomationProcess();

    try {
      const runtime = this.getAutomationRuntime();
      if (!fs.existsSync(runtime.exe)) {
        return {
          success: false,
          error: "未找到运行环境 (automation.exe 或 AutoHotkey v2)",
        };
      }

      this.currentPlayingScriptPath = scriptPath;
      const args = [
        ...runtime.args,
        "play",
        scriptPath,
        repeatCount.toString(),
      ];
      this.automationProcess = spawn(runtime.exe, args, {
        windowsHide: true,
        stdio: ["ignore", "pipe", "pipe"],
      });

      this.setupProcessHandlers();

      return { success: true };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  }

  async stopPlay(): Promise<{ success: boolean }> {
    this.killAutomationProcess();
    return { success: true };
  }

  async listScripts(): Promise<string[]> {
    this.ensureScriptDirs();
    try {
      const files = fs.readdirSync(this.scriptsDir);
      return files
        .filter((f: string) => f.endsWith(".json") && !f.startsWith("_"))
        .map((f: string) => f.replace(".json", ""));
    } catch {
      return [];
    }
  }

  async deleteScript(
    name: string,
  ): Promise<{ success: boolean; error?: string }> {
    this.ensureScriptDirs();
    const scriptPath = path.join(this.scriptsDir, `${name}.json`);
    const cfgPath = path.join(this.scriptsConfigDir, `${name}.json`);
    try {
      if (fs.existsSync(scriptPath)) fs.unlinkSync(scriptPath);
      if (fs.existsSync(cfgPath)) fs.unlinkSync(cfgPath);
      return { success: true };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  }

  async saveConfig(
    name: string,
    config: any,
  ): Promise<{ success: boolean; error?: string }> {
    this.ensureScriptDirs();
    const cfgPath = path.join(this.scriptsConfigDir, `${name}.json`);
    try {
      fs.writeFileSync(cfgPath, JSON.stringify(config, null, 2), "utf-8");
      return { success: true };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  }

  async getConfig(name: string): Promise<any> {
    this.ensureScriptDirs();
    const cfgPath = path.join(this.scriptsConfigDir, `${name}.json`);
    try {
      if (fs.existsSync(cfgPath)) {
        return JSON.parse(fs.readFileSync(cfgPath, "utf-8"));
      }
    } catch {
      // ignore
    }
    return null;
  }

  async breakpointResume(
    data: BreakpointData,
  ): Promise<{ success: boolean; error?: string }> {
    if (this.automationProcess && !this.automationProcess.killed) {
      if (this.currentRecordingScriptPath) {
        const resumeFile = this.currentRecordingScriptPath + ".resume";
        fs.writeFileSync(
          resumeFile,
          JSON.stringify({
            t_trigger: data.tTrigger ?? 0,
            x: data.x,
            y: data.y,
            w: data.w,
            h: data.h,
            text: data.text,
          }),
        );
      }
      return { success: true };
    }
    return { success: false, error: "No active automation process" };
  }

  async getScreenshot(): Promise<{ error?: string; data?: string }> {
    try {
      if (!this.mainWindow()) return { error: "Main window not available" };
      const image = await this.mainWindow()!.webContents.capturePage();
      const buffer = image.toPNG();
      return { data: "data:image/png;base64," + buffer.toString("base64") };
    } catch (e: any) {
      return { error: e.message };
    }
  }

  setupIPCHandlers(): void {
    // Start Recording
    ipcMain.handle("automation-start-record", async (_event, name: string) => {
      return this.startRecord(name);
    });

    // Save Script Directly
    ipcMain.handle(
      "automation-save-script",
      async (_event, name: string, events: any[]) => {
        return this.saveScript(name, events);
      },
    );

    // Stop Recording
    ipcMain.handle("automation-stop-record", async () => {
      return this.stopRecord();
    });

    // Start Playing
    ipcMain.handle("automation-start-play", async (_event, name: string) => {
      return this.startPlay(name);
    });

    // Stop Playing
    ipcMain.handle("automation-stop-play", async () => {
      return this.stopPlay();
    });

    // List Scripts
    ipcMain.handle("automation-list-scripts", async () => {
      return this.listScripts();
    });

    // Delete Script
    ipcMain.handle("automation-delete-script", async (_event, name: string) => {
      return this.deleteScript(name);
    });

    // Save Config
    ipcMain.handle(
      "automation-save-config",
      async (_event, name: string, config: any) => {
        return this.saveConfig(name, config);
      },
    );

    // Get Config
    ipcMain.handle("automation-get-config", async (_event, name: string) => {
      return this.getConfig(name);
    });

    // Breakpoint Resume
    ipcMain.handle(
      "automation-breakpoint-resume",
      async (_event, data: BreakpointData) => {
        return this.breakpointResume(data);
      },
    );

    // Get Screenshot
    ipcMain.handle("automation-get-screenshot", async () => {
      return this.getScreenshot();
    });
  }

  handleOCRResponse(
    data: { requestId: string; text: string; matched: boolean },
  ): void {
    console.log(
      `OCR Result [id=${data.requestId}] from Renderer: "${data.text}", matched: ${data.matched}`,
    );
    this.mainWindow()?.webContents.send(
      "automation-status",
      `STATUS|OCR_RESULT|${data.requestId}|${data.matched ? "1" : "0"}|${encodeURIComponent(data.text ?? "")}`,
    );

    if (this.currentPlayingScriptPath) {
      if (data.matched) {
        console.log(
          `OCR matched! Stopping automation [id=${data.requestId}].`,
        );
        fs.writeFileSync(
          `${this.currentPlayingScriptPath}.stop_script_${data.requestId}`,
          "",
        );
      } else {
        console.log(`OCR did NOT match. Continuing [id=${data.requestId}].`);
        fs.writeFileSync(
          `${this.currentPlayingScriptPath}.continue_${data.requestId}`,
          "",
        );
      }
    }
  }

  kill(): void {
    this.killAutomationProcess();
  }
}
