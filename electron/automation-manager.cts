import {
  app,
  BrowserWindow,
  ipcMain,
  shell,
} from "electron";
import path from "path";
import fs from "fs";
import { spawn, ChildProcess } from "child_process";
import { execFile } from "child_process";
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
  private macPlayStopped = false;

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
    if (process.platform === "darwin") {
      return { exe: "", args: [] };
    }

    if (process.platform !== "win32") {
      return { exe: "", args: [] };
    }

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
    }
  }

  private setupProcessHandlers(): void {
    if (!this.automationProcess) return;

    this.automationProcess.stdout?.on("data", (data: Buffer) => {
      const rawOutput = data.toString();

      const lines = rawOutput
        .split("\n")
        .filter((l: string) => l.trim());
      for (const line of lines) {
        const trimmed = line.trim();
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
      this.mainWindow()?.webContents.send("automation-status", "STATUS|PROCESS_EXIT");
    });
  }

  async startRecord(name: string): Promise<{ success: boolean; error?: string }> {
    if (process.platform === "darwin") {
      return {
        success: false,
        error: "macOS 录制能力建议通过 Hammerspoon / Keyboard Maestro 实现，当前内置录制仍在完善中",
      };
    }

    if (process.platform !== "win32") {
      return { success: false, error: "录制功能当前仅支持 Windows / macOS" };
    }

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

    if (process.platform === "darwin") {
      this.currentPlayingScriptPath = scriptPath;
      this.macPlayStopped = false;

      const hsExists = await this.hasHammerspoonCli();
      if (!hsExists) {
        return {
          success: false,
          error:
            "macOS 自动化依赖 Hammerspoon CLI（hs）。请安装 Hammerspoon 并允许辅助功能权限",
        };
      }

      void this.playOnMac(scriptPath, repeatCount).catch((err) => {
        console.error("macOS automation play failed:", err);
        this.mainWindow()?.webContents.send("automation-status", "STATUS|PROCESS_EXIT");
      });

      return { success: true };
    }

    if (process.platform !== "win32") {
      return { success: false, error: "回放功能当前仅支持 Windows / macOS" };
    }

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
    if (process.platform === "darwin") {
      this.macPlayStopped = true;
      this.mainWindow()?.webContents.send("automation-status", "STATUS|STOPPED|0");
      return { success: true };
    }

    this.killAutomationProcess();
    return { success: true };
  }

  private async hasHammerspoonCli(): Promise<boolean> {
    const candidates = ["/opt/homebrew/bin/hs", "/usr/local/bin/hs", "hs"];
    for (const candidate of candidates) {
      try {
        await this.execFileAsync(candidate, ["-c", "return true"]);
        return true;
      } catch {
        // try next
      }
    }
    return false;
  }

  private execFileAsync(cmd: string, args: string[]): Promise<string> {
    return new Promise((resolve, reject) => {
      execFile(cmd, args, (error, stdout, stderr) => {
        if (error) {
          reject(new Error(stderr || error.message));
          return;
        }
        resolve((stdout || "").trim());
      });
    });
  }

  private mapMacKey(key: string): string {
    const normalized = (key || "").trim();
    const alias: Record<string, string> = {
      Numpad0: "pad0",
      Numpad1: "pad1",
      Numpad2: "pad2",
      Numpad3: "pad3",
      Numpad4: "pad4",
      Numpad5: "pad5",
      Numpad6: "pad6",
      Numpad7: "pad7",
      Numpad8: "pad8",
      Numpad9: "pad9",
      Enter: "return",
      Escape: "escape",
      Space: "space",
    };
    return alias[normalized] ?? normalized.toLowerCase();
  }

  private buildMouseLua(evt: any): string {
    const x = Number(evt.x || 0);
    const y = Number(evt.y || 0);
    const button = evt.button === "right" ? "right" : evt.button === "middle" ? "middle" : "left";
    if (evt.type === "mousemove") {
      return `hs.mouse.absolutePosition({x=${x}, y=${y}})`;
    }
    if (evt.type === "mousedown") {
      return `hs.eventtap.event.newMouseEvent(hs.eventtap.event.types.${button}MouseDown, {x=${x}, y=${y}}):post()`;
    }
    if (evt.type === "mouseup") {
      return `hs.eventtap.event.newMouseEvent(hs.eventtap.event.types.${button}MouseUp, {x=${x}, y=${y}}):post()`;
    }
    if (evt.type === "mousewheel") {
      const delta = evt.button === "up" ? 1 : -1;
      return `hs.mouse.absolutePosition({x=${x}, y=${y}}); hs.eventtap.scrollWheel({0, ${delta}}, {}, 'line')`;
    }
    return "";
  }

  private async runHs(luaCode: string): Promise<void> {
    const candidates = ["/opt/homebrew/bin/hs", "/usr/local/bin/hs", "hs"];
    let lastError = "";
    for (const candidate of candidates) {
      try {
        await this.execFileAsync(candidate, ["-c", luaCode]);
        return;
      } catch (e) {
        lastError = e instanceof Error ? e.message : "unknown";
      }
    }
    throw new Error(lastError || "hs command failed");
  }

  private async sleep(ms: number): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, ms));
  }

  private async waitOcrResult(scriptPath: string, requestId: number): Promise<"continue" | "stop"> {
    const continueFile = `${scriptPath}.continue_${requestId}`;
    const stopScriptFile = `${scriptPath}.stop_script_${requestId}`;

    while (!this.macPlayStopped) {
      if (fs.existsSync(continueFile)) {
        fs.unlinkSync(continueFile);
        return "continue";
      }
      if (fs.existsSync(stopScriptFile)) {
        fs.unlinkSync(stopScriptFile);
        return "stop";
      }
      await this.sleep(100);
    }

    return "stop";
  }

  private async playOnMac(scriptPath: string, repeatCount: number): Promise<void> {
    const events = JSON.parse(fs.readFileSync(scriptPath, "utf-8"));
    if (!Array.isArray(events) || events.length === 0) {
      this.mainWindow()?.webContents.send("automation-status", "STATUS|PROCESS_EXIT");
      return;
    }

    this.mainWindow()?.webContents.send("automation-status", "STATUS|PLAYING");

    let loop = 0;
    let requestId = 0;

    while (!this.macPlayStopped) {
      loop += 1;
      if (repeatCount > 0 && loop > repeatCount) {
        break;
      }

      this.mainWindow()?.webContents.send("automation-status", `STATUS|LOOP_START|${loop}`);

      const playStart = Date.now();
      for (const evt of events) {
        if (this.macPlayStopped) break;

        const targetTime = Math.max(0, Number(evt?.t || 0));
        const waitMs = playStart + targetTime - Date.now();
        if (waitMs > 0) {
          await this.sleep(waitMs);
        }

        if (evt?.type === "breakpoint") {
          requestId += 1;
          const expectedText = String(evt?.text ?? "");
          const x = Number(evt?.x ?? 0);
          const y = Number(evt?.y ?? 0);
          const w = Number(evt?.w ?? 0);
          const h = Number(evt?.h ?? 0);
          await this.handlePlaybackOCRRequest(`REQ|OCR|${requestId}|0|${x}|${y}|${w}|${h}|${expectedText}`);
          const decision = await this.waitOcrResult(scriptPath, requestId);
          if (decision === "stop") {
            this.macPlayStopped = true;
            break;
          }
          continue;
        }

        if (["mousemove", "mousedown", "mouseup", "mousewheel"].includes(evt?.type)) {
          const lua = this.buildMouseLua(evt);
          if (lua) {
            await this.runHs(lua);
          }
          continue;
        }

        if (evt?.type === "keydown" || evt?.type === "keyup") {
          const key = this.mapMacKey(String(evt?.key ?? ""));
          const isDown = evt.type === "keydown";
          await this.runHs(
            `hs.eventtap.event.newKeyEvent({}, ${JSON.stringify(key)}, ${isDown ? "true" : "false"}):post()`,
          );
        }
      }

      if (this.macPlayStopped) {
        break;
      }

      this.mainWindow()?.webContents.send("automation-status", `STATUS|LOOP_END|${loop}`);
      await this.sleep(500);
    }

    this.mainWindow()?.webContents.send("automation-status", `STATUS|STOPPED|${Math.max(loop - (this.macPlayStopped ? 0 : 1), 0)}`);
    this.mainWindow()?.webContents.send("automation-status", "STATUS|PROCESS_EXIT");
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
