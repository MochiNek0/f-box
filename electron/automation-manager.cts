import {
  app,
  BrowserWindow,
  ipcMain,
  globalShortcut,
} from "electron";
import path from "path";
import fs from "fs";
import { spawn, ChildProcess } from "child_process";
import { OcrManager } from "./ocr.cjs";
import { killProcessTree } from "./process-utils.cjs";
import { OcrResultManager, OcrResultEntry } from "./ocr-result-manager.cjs";

export interface BreakpointData {
  x: number;
  y: number;
  w: number;
  h: number;
  text: string;
  tTrigger?: number;
}

export type AutomationHotkeyKey = "F3" | "F4" | "F5";

export interface AutomationHotkeySlots {
  F3: string | null;
  F4: string | null;
  F5: string | null;
}

export interface AutomationHotkeyPressResult {
  handled: boolean;
  success: boolean;
  action: "empty" | "start" | "stop" | "ignored";
  key: AutomationHotkeyKey;
  scriptName?: string;
  error?: string;
}

const AUTOMATION_HOTKEY_KEYS: AutomationHotkeyKey[] = ["F3", "F4", "F5"];

const createEmptyHotkeySlots = (): AutomationHotkeySlots => ({
  F3: null,
  F4: null,
  F5: null,
});

export class AutomationManager {
  private mainWindow: () => BrowserWindow | null;
  private ocrManager: OcrManager | null;
  private automationProcess: ChildProcess | null = null;
  private currentRecordingScriptPath: string | null = null;
  private currentPlayingScriptPath: string | null = null;
  private activeHotkeySlot: AutomationHotkeyKey | null = null;
  private configDir: string;
  private scriptsDir: string;
  private scriptsConfigDir: string;
  private hotkeySlotsPath: string;
  private stdoutBuffer = "";
  private ocrRequestMap = new Map<string, { eventIndex: number; expectedText: string }>();
  private currentRunCount = 0;
  private ocrResultManager: OcrResultManager;
  private procStdoutHandler: ((data: Buffer) => void) | null = null;
  private procStderrHandler: ((data: Buffer) => void) | null = null;
  private procExitHandler: (() => void) | null = null;
  private procErrorHandler: ((err: Error) => void) | null = null;
  private stopHotkeyRegistered = false;

  constructor(
    getWindow: () => BrowserWindow | null,
    ocrManager: OcrManager | null,
  ) {
    this.mainWindow = getWindow;
    this.ocrManager = ocrManager;

    this.configDir = path.join(app.getPath("home"), ".f-box");
    this.scriptsDir = path.join(this.configDir, "scripts");
    this.scriptsConfigDir = path.join(this.configDir, "scripts_config");
    this.hotkeySlotsPath = path.join(this.configDir, "automation_hotkeys.json");
    this.ocrResultManager = new OcrResultManager();
  }

  private getAutomationRuntime(): { exe: string; args: string[] } {
    // Only support automation on Windows
    if (process.platform !== "win32") {
      console.log("Automation is only supported on Windows");
      return { exe: "", args: [] };
    }

    const exePath = app.isPackaged
      ? path.join(process.resourcesPath, "automation.exe")
      : path.join(__dirname, "..", "public", "assets", "automation.exe");

    console.log("Using Automation EXE:", exePath);
    return { exe: exePath, args: [] };
  }

  private ensureScriptDirs(): void {
    if (!fs.existsSync(this.configDir)) {
      fs.mkdirSync(this.configDir, { recursive: true });
    }
    if (!fs.existsSync(this.scriptsDir)) {
      fs.mkdirSync(this.scriptsDir, { recursive: true });
    }
    if (!fs.existsSync(this.scriptsConfigDir)) {
      fs.mkdirSync(this.scriptsConfigDir, { recursive: true });
    }
  }

  private listScriptNames(): string[] {
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

  private normalizeHotkeySlots(raw: any): AutomationHotkeySlots {
    const scripts = new Set(this.listScriptNames());
    const slots = createEmptyHotkeySlots();

    for (const key of AUTOMATION_HOTKEY_KEYS) {
      const value = raw?.[key];
      slots[key] = typeof value === "string" && scripts.has(value) ? value : null;
    }

    return slots;
  }

  private writeHotkeySlots(slots: AutomationHotkeySlots): void {
    this.ensureScriptDirs();
    fs.writeFileSync(
      this.hotkeySlotsPath,
      JSON.stringify(slots, null, 2),
      "utf-8",
    );
    this.mainWindow()?.webContents.send(
      "automation-hotkey-slots-changed",
      slots,
    );
  }

  getHotkeySlots(): AutomationHotkeySlots {
    this.ensureScriptDirs();
    if (!fs.existsSync(this.hotkeySlotsPath)) {
      return createEmptyHotkeySlots();
    }

    try {
      let content = fs.readFileSync(this.hotkeySlotsPath, "utf-8");
      if (content.charCodeAt(0) === 0xFEFF) {
        content = content.slice(1);
      }
      return this.normalizeHotkeySlots(JSON.parse(content));
    } catch (e) {
      console.error("Error reading automation hotkey slots:", e);
      return createEmptyHotkeySlots();
    }
  }

  saveHotkeySlots(
    slots: AutomationHotkeySlots,
  ): { success: boolean; error?: string; slots?: AutomationHotkeySlots } {
    try {
      const normalizedSlots = this.normalizeHotkeySlots(slots);
      this.writeHotkeySlots(normalizedSlots);
      return { success: true, slots: normalizedSlots };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  }

  private clearScriptFromHotkeySlots(name: string): void {
    const slots = this.getHotkeySlots();
    let changed = false;

    for (const key of AUTOMATION_HOTKEY_KEYS) {
      if (slots[key] === name) {
        slots[key] = null;
        changed = true;
      }
    }

    if (changed) {
      this.writeHotkeySlots(slots);
    }
  }

  private killAutomationProcess(): void {
    this.removeProcessHandlers();

    if (this.automationProcess && !this.automationProcess.killed) {
      const pid = this.automationProcess.pid;
      try {
        this.automationProcess.kill();
      } catch (e) {
        // ignore
      }
      this.automationProcess = null;
      killProcessTree(pid);
    }
  }

  /**
   * Register F10 as a global stop hotkey during playback.
   *
   * Why this exists: the in-script AHK F10 hook only fires while the game
   * window is unfocused on Electron (or when AHK is responsive). If the game
   * grabs focus AND the AHK process hangs on a long Sleep/Send loop, the
   * advertised "press F10 to stop" stops working — users had to kill the
   * exe from Task Manager. globalShortcut uses RegisterHotKey under the
   * hood, runs at the OS level, and fires regardless of focus or whether
   * AHK is responding.
   *
   * Co-existence with the AHK F10: globalShortcut and AHK's low-level
   * keyboard hook are independent paths; both may fire. stopPlay is
   * idempotent (killAutomationProcess guards on `.killed`), so double-fire
   * is harmless. We only register for playback — recording's F10 has a
   * different meaning in AHK (finalize/save) and we don't want to bypass it.
   */
  private registerStopHotkey(): void {
    if (this.stopHotkeyRegistered) return;
    try {
      const ok = globalShortcut.register("F10", () => {
        console.log("Global F10 pressed — stopping automation playback");
        this.stopPlay().catch((e) =>
          console.error("stopPlay (F10 global) failed:", e),
        );
      });
      if (ok) {
        this.stopHotkeyRegistered = true;
      } else {
        // Another app (or our own boss-key) owns F10 — log and continue.
        // Users can still stop via the UI button or per-slot hotkey.
        console.warn(
          "Failed to register global F10 stop hotkey (already taken)",
        );
      }
    } catch (e) {
      console.error("Error registering global F10 stop hotkey:", e);
    }
  }

  private unregisterStopHotkey(): void {
    if (!this.stopHotkeyRegistered) return;
    try {
      globalShortcut.unregister("F10");
    } catch (e) {
      console.error("Error unregistering global F10:", e);
    }
    this.stopHotkeyRegistered = false;
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

    this.ocrRequestMap.set(requestId, {
      eventIndex: parseInt(index),
      expectedText,
    });

    console.log(
      `Playback OCR Request [id=${requestId}]: Expected "${expectedText}" at (${x},${y},${w},${h})`,
    );

    try {
      if (!this.mainWindow()) return;
      const image = await this.mainWindow()!.webContents.capturePage();
      const imgBuffer = image.toJPEG(80);

      const screenshotData =
        "data:image/jpeg;base64," + imgBuffer.toString("base64");

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

    // Remove previous handlers if any
    this.removeProcessHandlers();

    const activeProcess = this.automationProcess;
    this.stdoutBuffer = "";

    this.procStdoutHandler = (data: Buffer) => {
      if (this.automationProcess !== activeProcess) return;
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
        } else if (trimmed.startsWith("STATUS|LOOP_START")) {
          const loopParts = trimmed.split("|");
          this.currentRunCount = parseInt(loopParts[2] || "0", 10);
          this.mainWindow()?.webContents.send("automation-status", trimmed);
        } else {
          this.mainWindow()?.webContents.send("automation-status", trimmed);
        }
      }
    };

    this.procStderrHandler = (data: Buffer) => {
      if (this.automationProcess !== activeProcess) return;
      console.error("Automation stderr:", data.toString());
    };

    this.procExitHandler = () => {
      if (this.automationProcess !== activeProcess) return;
      this.teardownAfterProcessExit();
    };

    // Async spawn / runtime errors (ENOENT, EACCES, AV block, etc.) emit
    // 'error' instead of throwing synchronously. Without this listener the
    // event would crash the main process. We forward to the same teardown as
    // exit so the UI receives PROCESS_EXIT and recovers.
    this.procErrorHandler = (err: Error) => {
      if (this.automationProcess !== activeProcess) return;
      console.error("Automation process error:", err);
      this.teardownAfterProcessExit();
    };

    activeProcess.stdout?.on("data", this.procStdoutHandler);
    activeProcess.stderr?.on("data", this.procStderrHandler);
    activeProcess.on("exit", this.procExitHandler);
    activeProcess.on("error", this.procErrorHandler);
  }

  /**
   * Shared teardown for both the 'exit' and 'error' events: reset playback
   * state, drop the F10 hotkey, notify the UI, and clear the stored handler
   * refs. Kept as one method so the exit and error paths can never drift.
   */
  private teardownAfterProcessExit(): void {
    this.automationProcess = null;
    this.currentPlayingScriptPath = null;
    this.currentRecordingScriptPath = null;
    this.activeHotkeySlot = null;
    this.stdoutBuffer = "";
    this.unregisterStopHotkey();
    this.mainWindow()?.webContents.send("automation-status", "STATUS|PROCESS_EXIT");
    this.procStdoutHandler = null;
    this.procStderrHandler = null;
    this.procExitHandler = null;
    this.procErrorHandler = null;
  }

  private removeProcessHandlers(): void {
    if (this.automationProcess) {
      if (this.procStdoutHandler) {
        this.automationProcess.stdout?.removeListener("data", this.procStdoutHandler);
      }
      if (this.procStderrHandler) {
        this.automationProcess.stderr?.removeListener("data", this.procStderrHandler);
      }
      if (this.procExitHandler) {
        this.automationProcess.removeListener("exit", this.procExitHandler);
      }
      if (this.procErrorHandler) {
        this.automationProcess.removeListener("error", this.procErrorHandler);
      }
    }
    this.procStdoutHandler = null;
    this.procStderrHandler = null;
    this.procExitHandler = null;
    this.procErrorHandler = null;
  }

  async startRecord(name: string): Promise<{ success: boolean; error?: string }> {
    this.ensureScriptDirs();
    this.killAutomationProcess();
    // killAutomationProcess detaches the exit listener before SIGTERM, so
    // a previously-registered playback F10 would otherwise survive into the
    // record session and fire stopPlay() on F10 — killing the recording.
    this.unregisterStopHotkey();
    this.currentPlayingScriptPath = null;
    this.activeHotkeySlot = null;
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

  async startPlay(
    name: string,
    hotkeySlot: AutomationHotkeyKey | null = null,
  ): Promise<{ success: boolean; error?: string }> {
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
    // killAutomationProcess detaches the exit listener before SIGTERM, so a
    // stale F10 registration from the previous run could fire stopPlay()
    // against the new process unexpectedly. Re-register cleanly below.
    this.unregisterStopHotkey();
    this.activeHotkeySlot = null;
    this.currentRecordingScriptPath = null;

    try {
      const runtime = this.getAutomationRuntime();
      if (!fs.existsSync(runtime.exe)) {
        return {
          success: false,
          error: "未找到运行环境 (automation.exe 或 AutoHotkey v2)",
        };
      }

      this.currentPlayingScriptPath = scriptPath;
      this.activeHotkeySlot = hotkeySlot;
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
      this.registerStopHotkey();

      return { success: true };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
  }

  async stopPlay(): Promise<{ success: boolean }> {
    const stoppedHotkeySlot = this.activeHotkeySlot;
    this.unregisterStopHotkey();
    this.killAutomationProcess();
    this.currentPlayingScriptPath = null;
    this.activeHotkeySlot = null;
    if (stoppedHotkeySlot) {
      this.mainWindow()?.webContents.send(
        "automation-status",
        `STATUS|HOTKEY_SLOT_STOPPED|${stoppedHotkeySlot}`,
      );
    }
    return { success: true };
  }

  async handleHotkeySlotPress(
    key: AutomationHotkeyKey,
  ): Promise<AutomationHotkeyPressResult> {
    const slots = this.getHotkeySlots();
    const scriptName = slots[key];

    if (!scriptName) {
      return { handled: false, success: true, action: "empty", key };
    }

    if (this.currentRecordingScriptPath) {
      this.mainWindow()?.webContents.send(
        "automation-status",
        `STATUS|HOTKEY_SLOT_IGNORED|${key}|RECORDING`,
      );
      return {
        handled: true,
        success: false,
        action: "ignored",
        key,
        scriptName,
        error: "Recording is active",
      };
    }

    if (this.automationProcess && !this.automationProcess.killed) {
      if (this.currentPlayingScriptPath && this.activeHotkeySlot === key) {
        await this.stopPlay();
        return { handled: true, success: true, action: "stop", key, scriptName };
      }

      this.mainWindow()?.webContents.send(
        "automation-status",
        `STATUS|HOTKEY_SLOT_IGNORED|${key}|${this.activeHotkeySlot ?? "MANUAL"}`,
      );
      return { handled: true, success: true, action: "ignored", key, scriptName };
    }

    const result = await this.startPlay(scriptName, key);
    if (result.success) {
      this.mainWindow()?.webContents.send(
        "automation-status",
        `STATUS|HOTKEY_SLOT_STARTED|${key}|${encodeURIComponent(scriptName)}`,
      );
      return { handled: true, success: true, action: "start", key, scriptName };
    }

    return {
      handled: true,
      success: false,
      action: "start",
      key,
      scriptName,
      error: result.error,
    };
  }

  async listScripts(): Promise<string[]> {
    return this.listScriptNames();
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
      this.clearScriptFromHotkeySlots(name);
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
        let content = fs.readFileSync(cfgPath, "utf-8");
        if (content.charCodeAt(0) === 0xFEFF) {
          content = content.slice(1);
        }
        return JSON.parse(content);
      }
    } catch {
      // ignore
    }
    return null;
  }

  async getScriptEvents(
    name: string,
  ): Promise<{ success: boolean; events?: any[]; error?: string }> {
    this.ensureScriptDirs();
    const scriptPath = path.join(this.scriptsDir, `${name}.json`);
    try {
      if (!fs.existsSync(scriptPath)) {
        return { success: false, error: "脚本文件不存在" };
      }
      let content = fs.readFileSync(scriptPath, "utf-8");
      if (content.charCodeAt(0) === 0xFEFF) {
        content = content.slice(1);
      }
      const events = JSON.parse(content);
      const breakpointsFound = events.filter((e: any) => e.type === "breakpoint").length;
      console.log(`[Backend Debug] getScriptEvents loaded ${events.length} events for ${name}. Breakpoints: ${breakpointsFound}`);
      return { success: true, events };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
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
      const buffer = image.toJPEG(80);
      return { data: "data:image/jpeg;base64," + buffer.toString("base64") };
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

    // Automation Hotkey Slots
    ipcMain.handle("automation-get-hotkey-slots", async () => {
      return this.getHotkeySlots();
    });

    ipcMain.handle(
      "automation-save-hotkey-slots",
      async (_event, slots: AutomationHotkeySlots) => {
        return this.saveHotkeySlots(slots);
      },
    );

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

    // Get Script Events
    ipcMain.handle(
      "automation-get-script-events",
      async (_event, name: string) => {
        return this.getScriptEvents(name);
      },
    );

    // Get Screenshot
    ipcMain.handle("automation-get-screenshot", async () => {
      return this.getScreenshot();
    });

    // Get OCR Results
    ipcMain.handle("automation-get-ocr-results", async (_event, name: string) => {
      return this.getOcrResults(name);
    });

    // Clear OCR Results
    ipcMain.handle("automation-clear-ocr-results", async (_event, name: string) => {
      return this.clearOcrResults(name);
    });
  }

  handleOCRResponse(
    data: {
      requestId: string;
      text: string;
      matched: boolean;
      error?: string;
    },
  ): void {
    // OCR subsystem failure (process crash, timeout, plugin not installed,
    // preprocess error) must NOT be conflated with "condition not met".
    // Otherwise a "stop on text X" script loops forever when OCR is broken.
    // Treat failure as a forced stop and surface a distinct status to the UI.
    const failed = !!data.error;

    console.log(
      `OCR Result [id=${data.requestId}] from Renderer: "${data.text}", matched: ${data.matched}${failed ? `, error: ${data.error}` : ""}`,
    );

    if (failed) {
      this.mainWindow()?.webContents.send(
        "automation-status",
        `STATUS|OCR_FAILED|${data.requestId}|${encodeURIComponent(data.error!)}`,
      );
    } else {
      this.mainWindow()?.webContents.send(
        "automation-status",
        `STATUS|OCR_RESULT|${data.requestId}|${data.matched ? "1" : "0"}|${encodeURIComponent(data.text ?? "")}`,
      );
    }

    // Persist OCR result
    const mapping = this.ocrRequestMap.get(data.requestId);
    if (mapping && this.currentPlayingScriptPath) {
      this.ocrRequestMap.delete(data.requestId);
      const scriptName = path.basename(this.currentPlayingScriptPath, ".json");
      const entry: OcrResultEntry = {
        timestamp: new Date().toISOString(),
        runCount: this.currentRunCount,
        eventIndex: mapping.eventIndex,
        requestId: data.requestId,
        recognizedText: failed ? `[OCR 故障: ${data.error}]` : (data.text ?? ""),
        expectedText: mapping.expectedText,
        matched: failed ? false : data.matched,
      };
      this.ocrResultManager.saveResult(scriptName, entry);
    }

    if (this.currentPlayingScriptPath) {
      try {
        if (failed) {
          console.log(
            `OCR FAILED. Stopping automation [id=${data.requestId}]: ${data.error}`,
          );
          fs.writeFileSync(
            `${this.currentPlayingScriptPath}.stop_script_${data.requestId}`,
            "",
          );
        } else if (data.matched) {
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
      } catch (e) {
        console.error("Failed to write OCR signal file:", e);
      }
    }
  }

  getOcrResults(name: string): OcrResultEntry[] {
    return this.ocrResultManager.getResults(name);
  }

  clearOcrResults(name: string): { success: boolean } {
    const success = this.ocrResultManager.clearResults(name);
    return { success };
  }

  kill(): void {
    this.unregisterStopHotkey();
    this.killAutomationProcess();
    this.ocrRequestMap.clear();
    this.currentRunCount = 0;
  }

  cleanupIPCHandlers(): void {
    const channels = [
      "automation-start-record",
      "automation-save-script",
      "automation-stop-record",
      "automation-start-play",
      "automation-stop-play",
      "automation-list-scripts",
      "automation-get-hotkey-slots",
      "automation-save-hotkey-slots",
      "automation-delete-script",
      "automation-save-config",
      "automation-get-config",
      "automation-breakpoint-resume",
      "automation-get-script-events",
      "automation-get-screenshot",
      "automation-get-ocr-results",
      "automation-clear-ocr-results",
    ];
    for (const channel of channels) {
      ipcMain.removeHandler(channel);
    }
  }
}
