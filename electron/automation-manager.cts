import {
  app,
  BrowserWindow,
  ipcMain,
  globalShortcut,
  webContents,
} from "electron";
import path from "path";
import fs from "fs";
import { OcrManager } from "./ocr.cjs";
import { OcrResultManager, OcrResultEntry } from "./ocr-result-manager.cjs";
import { PlaybackEngine, PlaybackEvent } from "./playback-engine.cjs";
import {
  GameGeometry,
  scriptSupportsIsolation,
} from "./automation-geometry.cjs";

export interface AutomationTarget {
  geometry: GameGeometry;
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
  // Renderer-side recording overlay active (guards the F3-F5 hotkey slots).
  private isRecording = false;
  // Keyboard capture during recording: the guest keeps focus so physical keys
  // reach the game directly; before-input-event mirrors them into the
  // renderer's recording session, and F9/F10 act as record-control hotkeys.
  private recordingGuest: Electron.WebContents | null = null;
  private recordingInputHandler:
    | ((event: Electron.Event, input: Electron.Input) => void)
    | null = null;
  private recordingHotkeys: Array<"F9" | "F10"> = [];
  private currentPlayingScriptPath: string | null = null;
  private activeHotkeySlot: AutomationHotkeyKey | null = null;
  private configDir: string;
  private scriptsDir: string;
  private scriptsConfigDir: string;
  private hotkeySlotsPath: string;
  private ocrRequestMap = new Map<string, { eventIndex: number; expectedText: string }>();
  private currentRunCount = 0;
  private ocrResultManager: OcrResultManager;
  private stopHotkeyRegistered = false;
  // Background (isolated) playback state
  private playbackEngine: PlaybackEngine | null = null;
  // Bumped whenever a new play/record session starts. A stopped engine's
  // onDone lands asynchronously (up to ~25ms later); if a new session has
  // already started by then, its teardown must become a no-op instead of
  // clobbering the new session's state (engine ref, F10, script path).
  private sessionSeq = 0;
  private activeTarget: AutomationTarget | null = null;
  private breakpointResolvers = new Map<
    string,
    (decision: "continue" | "stop") => void
  >();
  private ocrRequestCounter = 0;

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

  /**
   * Register F10 as a global stop hotkey during playback.
   *
   * globalShortcut uses RegisterHotKey under the hood and fires at the OS
   * level regardless of which window has focus, so the advertised "press F10
   * to stop" keeps working even when the game grabs focus. stopPlay is
   * idempotent, so a double fire is harmless. Playback only — during
   * recording F10 is handled by the recording overlay (stop & save), which
   * must not be bypassed.
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

  // Capture + OCR-request dispatch for PlaybackEngine breakpoints. Captures
  // the HOST page (unaffected by the injection-based playback) and asks the
  // renderer to OCR the region.
  private async dispatchOCRRequest(
    requestId: string,
    eventIndex: number,
    x: number,
    y: number,
    w: number,
    h: number,
    expectedText: string,
  ): Promise<void> {
    this.ocrRequestMap.set(requestId, { eventIndex, expectedText });

    console.log(
      `Playback OCR Request [id=${requestId}]: Expected "${expectedText}" at (${x},${y},${w},${h})`,
    );

    try {
      if (!this.mainWindow()) return;
      const image = await this.mainWindow()!.webContents.capturePage();
      const imgBuffer = image.toJPEG(80);

      const screenshotData =
        "data:image/jpeg;base64," + imgBuffer.toString("base64");

      this.mainWindow()?.webContents.send("automation-ocr-request", {
        requestId,
        screenshotData,
        region: { x, y, w, h },
        expectedText,
      });
    } catch (e) {
      console.error("Playback OCR Request Error:", e);
      // A capture failure is an OCR failure: force a stop, otherwise a
      // "stop on text X" script loops forever while capture keeps failing.
      this.resolveBreakpoint(requestId, "stop");
      this.mainWindow()?.webContents.send(
        "automation-status",
        `STATUS|OCR_RESULT|${requestId}|0|OCR_REQUEST_FAILED`,
      );
    }
  }

  // Resolve a pending playback breakpoint. Returns true if one was waiting.
  private resolveBreakpoint(
    requestId: string,
    decision: "continue" | "stop",
  ): boolean {
    const resolver = this.breakpointResolvers.get(requestId);
    if (resolver) {
      this.breakpointResolvers.delete(requestId);
      resolver(decision);
      return true;
    }
    return false;
  }

  // Stop and detach a running background playback engine (idempotent).
  private stopPlaybackEngine(): void {
    if (this.playbackEngine) {
      this.playbackEngine.stop();
      this.playbackEngine = null;
    }
    // Unblock any breakpoint the engine may be awaiting.
    for (const [, resolve] of this.breakpointResolvers) resolve("stop");
    this.breakpointResolvers.clear();
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

  async startPlay(
    name: string,
    hotkeySlot: AutomationHotkeyKey | null = null,
    target: AutomationTarget | null = null,
  ): Promise<{ success: boolean; error?: string }> {
    this.ensureScriptDirs();
    // Reset before each run; otherwise a non-looping script inherits the
    // previous run's LOOP_START count and stamps stale runCount into saved
    // OCR results.
    this.currentRunCount = 0;

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

    if (this.isRecording) {
      return { success: false, error: "正在录制中，请先停止录制" };
    }

    this.stopPlaybackEngine();
    // Drop a stale F10 registration from the previous run; re-registered
    // cleanly by runIsolatedPlayback.
    this.unregisterStopHotkey();
    this.activeHotkeySlot = null;

    // Playback is injection-only (PlaybackEngine): the script must carry a
    // v2+ meta sentinel and a live game webview must be available.
    const events = this.loadScriptEvents(scriptPath);
    if (!events) {
      return { success: false, error: "脚本文件损坏，无法播放" };
    }
    if (!scriptSupportsIsolation(events)) {
      return { success: false, error: "旧格式脚本无法播放，请重新录制" };
    }

    const geo = target?.geometry ?? this.activeTarget?.geometry ?? null;
    const guest =
      geo && typeof geo.webContentsId === "number"
        ? webContents.fromId(geo.webContentsId)
        : null;
    if (!guest || guest.isDestroyed()) {
      return { success: false, error: "请先打开游戏再播放" };
    }

    this.runIsolatedPlayback(
      scriptPath,
      guest,
      events as PlaybackEvent[],
      geo!,
      repeatCount,
      hotkeySlot,
    );
    return { success: true };
  }

  private loadScriptEvents(scriptPath: string): any[] | null {
    try {
      let content = fs.readFileSync(scriptPath, "utf-8");
      if (content.charCodeAt(0) === 0xfeff) content = content.slice(1);
      const parsed = JSON.parse(content);
      return Array.isArray(parsed) ? parsed : null;
    } catch (e) {
      console.error("Failed to load script events:", e);
      return null;
    }
  }

  private runIsolatedPlayback(
    scriptPath: string,
    guest: Electron.WebContents,
    events: PlaybackEvent[],
    geometry: GameGeometry,
    maxLoops: number,
    hotkeySlot: AutomationHotkeyKey | null,
  ): void {
    this.currentPlayingScriptPath = scriptPath;
    this.activeHotkeySlot = hotkeySlot;
    // Ask the renderer to focus the target game <webview> element. A main-side
    // WebContents.focus() on a webview guest does NOT establish the input
    // focus PPAPI Flash needs to accept injected mouse clicks — only a
    // renderer-side <webview>.focus() does (the recording path relies on the
    // same call). Without this, injected clicks are silently ignored.
    this.mainWindow()?.webContents.send(
      "automation-focus-guest",
      geometry.webContentsId,
    );
    // Callbacks from this engine are only honored while it is still the
    // current session — a replaced engine winding down must not emit status
    // or tear down its successor.
    const session = ++this.sessionSeq;

    const engine = new PlaybackEngine(guest, events, geometry, maxLoops, {
      onStatus: (line) => {
        if (session === this.sessionSeq) this.handleEngineStatus(line);
      },
      onBreakpoint: (evt, eventIndex) =>
        session === this.sessionSeq
          ? this.requestPlaybackOCR(evt, eventIndex)
          : Promise.resolve("stop" as const),
      onDone: () => this.teardownAfterPlayback(session),
    });
    this.playbackEngine = engine;
    this.registerStopHotkey();

    engine.run().catch((e) => {
      console.error("PlaybackEngine error:", e);
      this.teardownAfterPlayback(session);
    });
  }

  // Keep currentRunCount fresh for OCR-result persistence and forward the
  // status line to the renderer verbatim.
  private handleEngineStatus(line: string): void {
    if (line.startsWith("STATUS|LOOP_START")) {
      const parts = line.split("|");
      this.currentRunCount = parseInt(parts[2] || "0", 10);
    }
    this.mainWindow()?.webContents.send("automation-status", line);
  }

  private async requestPlaybackOCR(
    evt: PlaybackEvent,
    eventIndex: number,
  ): Promise<"continue" | "stop"> {
    if (!this.ocrManager || !this.ocrManager.isInstalled()) {
      console.warn("Breakpoint hit but OCR not installed; continuing.");
      this.mainWindow()?.webContents.send(
        "automation-status",
        "STATUS|OCR_NOT_INSTALLED",
      );
      return "continue";
    }
    const requestId = `bp_${++this.ocrRequestCounter}`;
    const promise = new Promise<"continue" | "stop">((resolve) =>
      this.breakpointResolvers.set(requestId, resolve),
    );
    await this.dispatchOCRRequest(
      requestId,
      eventIndex,
      evt.x ?? 0,
      evt.y ?? 0,
      evt.w ?? 0,
      evt.h ?? 0,
      evt.text ?? "",
    );
    return promise;
  }

  // Shared post-playback cleanup for the engine path (natural finish, stop, or
  // error). Idempotent — safe to call more than once. No-op when a newer
  // session has started since (stale engine's late onDone).
  private teardownAfterPlayback(session: number): void {
    if (session !== this.sessionSeq) return;
    this.playbackEngine = null;
    this.currentPlayingScriptPath = null;
    this.activeHotkeySlot = null;
    this.unregisterStopHotkey();
    for (const [, resolve] of this.breakpointResolvers) resolve("stop");
    this.breakpointResolvers.clear();
    this.mainWindow()?.webContents.send(
      "automation-status",
      "STATUS|PROCESS_EXIT",
    );
  }

  async stopPlay(): Promise<{ success: boolean }> {
    const stoppedHotkeySlot = this.activeHotkeySlot;
    this.unregisterStopHotkey();
    // Signal stop and let the engine's onDone teardown fire PROCESS_EXIT.
    this.stopPlaybackEngine();
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

    if (this.isRecording) {
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

    const playbackActive = !!this.playbackEngine;
    if (playbackActive) {
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
  ): Promise<{
    success: boolean;
    events?: any[];
    meta?: any;
    isolation?: boolean;
    error?: string;
  }> {
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
      const parsed = JSON.parse(content);
      const isolation = scriptSupportsIsolation(parsed);
      // Split off the meta sentinel: it's an internal header, not an input
      // event, so the UI edits `events` only. It is returned separately so
      // the renderer can prepend it back when re-saving — dropping it would
      // permanently downgrade the script to the unplayable legacy format.
      const meta = parsed.find((e: any) => e.type === "meta") ?? null;
      const events = parsed.filter((e: any) => e.type !== "meta");
      return { success: true, events, meta, isolation };
    } catch (e: any) {
      return { success: false, error: e.message };
    }
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

  // Attach recording keyboard capture to the guest. Focus stays on the guest
  // during recording (the overlay only intercepts the mouse), so physical
  // keys reach the game natively — before-input-event mirrors each key into
  // the renderer's recording session without consuming it. F9/F10 are
  // record-control keys, registered as global shortcuts (focus-independent,
  // same semantics as the old AHK Hotkey()); the before-input branch below is
  // only a fallback for when another app owns the registration.
  private startRecordingCapture(guest: Electron.WebContents): void {
    this.stopRecordingCapture();

    const handler = (event: Electron.Event, input: Electron.Input) => {
      if (input.type !== "keyDown" && input.type !== "keyUp") return;
      if (input.key === "F9" || input.key === "F10") {
        event.preventDefault();
        if (input.type === "keyDown") this.sendRecordHotkey(input.key);
        return;
      }
      this.mainWindow()?.webContents.send("automation-record-key", {
        type: input.type,
        code: input.code,
        key: input.key,
        isAutoRepeat: input.isAutoRepeat,
      });
    };
    guest.on("before-input-event", handler);
    this.recordingGuest = guest;
    this.recordingInputHandler = handler;

    for (const key of ["F9", "F10"] as const) {
      try {
        if (globalShortcut.register(key, () => this.sendRecordHotkey(key))) {
          this.recordingHotkeys.push(key);
        } else {
          // Taken by another app; the before-input fallback still works while
          // the guest has focus.
          console.warn(`Failed to register recording hotkey ${key}`);
        }
      } catch (e) {
        console.error(`Error registering recording hotkey ${key}:`, e);
      }
    }
  }

  private sendRecordHotkey(key: "F9" | "F10"): void {
    this.mainWindow()?.webContents.send("automation-record-hotkey", key);
  }

  private stopRecordingCapture(): void {
    if (
      this.recordingGuest &&
      this.recordingInputHandler &&
      !this.recordingGuest.isDestroyed()
    ) {
      this.recordingGuest.removeListener(
        "before-input-event",
        this.recordingInputHandler,
      );
    }
    this.recordingGuest = null;
    this.recordingInputHandler = null;
    for (const key of this.recordingHotkeys) {
      try {
        globalShortcut.unregister(key);
      } catch (e) {
        console.error(`Error unregistering recording hotkey ${key}:`, e);
      }
    }
    this.recordingHotkeys = [];
  }

  setupIPCHandlers(): void {
    // Live input forwarding from the recording overlay. Deliberately "dumb":
    // the renderer does all coordinate/keyCode mapping; main only validates
    // the guest and injects. A destroyed guest is silently dropped.
    ipcMain.on(
      "automation-forward-input",
      (_event, payload: { webContentsId?: number; event?: any } | null) => {
        if (
          !payload ||
          typeof payload.webContentsId !== "number" ||
          !payload.event
        ) {
          return;
        }
        const guest = webContents.fromId(payload.webContentsId);
        if (!guest || guest.isDestroyed()) return;
        // [DEBUG coord] recording-time forwarded injection
        if (payload.event.type === "mouseDown" || payload.event.type === "mouseUp") {
          console.log(
            `[REC-FWD] type=${payload.event.type} x=${payload.event.x} y=${payload.event.y} button=${payload.event.button}`,
          );
        }
        try {
          guest.sendInputEvent(payload.event);
        } catch (e) {
          console.error("automation-forward-input sendInputEvent failed:", e);
        }
      },
    );

    // Renderer-side recording started/ended: guards the F3-F5 hotkey slots,
    // stops any active playback so it can't inject into the game while the
    // user is recording it, and attaches/detaches the keyboard capture on the
    // guest (see startRecordingCapture).
    ipcMain.on(
      "automation-recording-state",
      (
        _event,
        payload: { recording?: boolean; webContentsId?: number } | null,
      ) => {
        this.isRecording = !!payload?.recording;
        if (this.isRecording) {
          this.stopPlay().catch((e) =>
            console.error("stopPlay (recording start) failed:", e),
          );
          const guest =
            typeof payload?.webContentsId === "number"
              ? webContents.fromId(payload.webContentsId)
              : null;
          if (guest && !guest.isDestroyed()) {
            this.startRecordingCapture(guest);
          }
        } else {
          this.stopRecordingCapture();
        }
      },
    );

    // Save Script Directly
    ipcMain.handle(
      "automation-save-script",
      async (_event, name: string, events: any[]) => {
        return this.saveScript(name, events);
      },
    );

    // Start Playing
    ipcMain.handle(
      "automation-start-play",
      async (_event, name: string, target?: AutomationTarget | null) => {
        return this.startPlay(name, null, target ?? null);
      },
    );

    // Cache the active game webview target (webContentsId + geometry) for the
    // F3/F4/F5 hotkey playback path, which has no renderer call to pass it.
    ipcMain.on(
      "automation-set-active-target",
      (_event, target: AutomationTarget | null) => {
        this.activeTarget = target ?? null;
      },
    );

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

    const decision: "continue" | "stop" =
      failed || data.matched ? "stop" : "continue";

    // Resolve the engine's in-process breakpoint promise.
    if (this.resolveBreakpoint(data.requestId, decision)) {
      console.log(
        `OCR [id=${data.requestId}] resolved breakpoint -> ${decision}`,
      );
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
    this.stopPlaybackEngine();
    this.stopRecordingCapture();
    this.isRecording = false;
    this.ocrRequestMap.clear();
    this.currentRunCount = 0;
  }

  cleanupIPCHandlers(): void {
    ipcMain.removeAllListeners("automation-set-active-target");
    ipcMain.removeAllListeners("automation-forward-input");
    ipcMain.removeAllListeners("automation-recording-state");
    const channels = [
      "automation-save-script",
      "automation-start-play",
      "automation-stop-play",
      "automation-list-scripts",
      "automation-get-hotkey-slots",
      "automation-save-hotkey-slots",
      "automation-delete-script",
      "automation-save-config",
      "automation-get-config",
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
