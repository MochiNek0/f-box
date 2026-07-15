export interface AutomationEvent {
  t: number;
  type:
    | "meta"
    | "keydown"
    | "keyup"
    | "mousedown"
    | "mouseup"
    | "mousemove"
    | "mousewheel"
    | "breakpoint";
  // v3 scripts: Electron keyCode (mapped from DOM e.code at record time).
  key?: string;
  button?: string;
  x?: number;
  y?: number;
  // Normalized (0..1) coordinates of the game surface for v2+ isolation scripts.
  nx?: number;
  ny?: number;
  w?: number;
  h?: number;
  text?: string;
  t_trigger?: number;
  // Meta sentinel fields (type === "meta", stored at index 0).
  version?: number;
  geometry?: GameGeometry;
}

// Input event forwarded to main for live injection into the game webview
// during recording (webContents.sendInputEvent shapes).
export type InjectedInputEvent =
  | { type: "mouseMove"; x: number; y: number }
  | {
      type: "mouseDown" | "mouseUp";
      x: number;
      y: number;
      button: "left" | "middle" | "right";
      clickCount: number;
    }
  | {
      type: "mouseWheel";
      x: number;
      y: number;
      deltaY: number;
      canScroll: boolean;
    }
  | {
      type: "keyDown" | "keyUp" | "char";
      keyCode: string;
      modifiers: string[];
    };

// Game surface geometry snapshot passed to record/play so recorded
// screen-absolute coordinates can be normalized and re-mapped for background
// (isolated) playback via webContents.sendInputEvent.
export interface GameGeometry {
  webContentsId: number;
  renderWidth: number;
  renderHeight: number;
  zoomFactor: number;
  resolutionScale: number;
  devicePixelRatio: number;
  screenX: number;
  screenY: number;
  screenW: number;
  screenH: number;
}

export interface AutomationTarget {
  geometry: GameGeometry;
}

export interface OCRResultItem {
  text?: string;
}

export interface OCRResponseData {
  code: number;
  data?: OCRResultItem[];
}

export interface OcrResultEntry {
  timestamp: string;
  runCount: number;
  eventIndex: number;
  requestId: string;
  recognizedText: string;
  expectedText: string;
  matched: boolean;
}

export interface AutomationConfig {
  repeatCount?: number;
  steps?: Array<{ id: string; key: string; intervalMs: number }>;
}

export type AutomationHotkeyKey = "F3" | "F4" | "F5";

export interface AutomationHotkeySlots {
  F3: string | null;
  F4: string | null;
  F5: string | null;
}

export interface AutomationAPI {
  // Fire-and-forget: inject a recorded input event into the game webview.
  forwardInput: (payload: {
    webContentsId: number;
    event: InjectedInputEvent;
  }) => void;
  // Notify main that renderer-side recording started/ended (guards the
  // F3-F5 hotkey slots and stops active playback on record start).
  // webContentsId (start only) lets main attach keyboard capture to the guest.
  setRecordingState: (recording: boolean, webContentsId?: number) => void;
  // Physical keys mirrored from the focused guest during recording; returns
  // a detach function.
  onRecordKey: (
    callback: (data: {
      type: "keyDown" | "keyUp";
      code: string;
      key: string;
      isAutoRepeat: boolean;
    }) => void,
  ) => () => void;
  // F9/F10 record-control hotkeys during recording; returns a detach function.
  onRecordHotkey: (callback: (key: "F9" | "F10") => void) => () => void;
  // Main asks the renderer to focus a game <webview> (by guest webContentsId)
  // at playback start so injected mouse clicks reach Flash; returns a detach
  // function.
  onFocusGuest: (callback: (webContentsId: number) => void) => () => void;
  startPlay: (
    name: string,
    target?: AutomationTarget | null,
  ) => Promise<{ success: boolean; error?: string }>;
  stopPlay: () => Promise<{ success: boolean }>;
  setActiveTarget: (target: AutomationTarget | null) => void;
  listScripts: () => Promise<string[]>;
  getHotkeySlots: () => Promise<AutomationHotkeySlots>;
  saveHotkeySlots: (
    slots: AutomationHotkeySlots,
  ) => Promise<{
    success: boolean;
    error?: string;
    slots?: AutomationHotkeySlots;
  }>;
  onHotkeySlotsChanged: (
    callback: (slots: AutomationHotkeySlots) => void,
  ) => () => void;
  deleteScript: (name: string) => Promise<{ success: boolean; error?: string }>;
  saveConfig: (
    name: string,
    config: AutomationConfig,
  ) => Promise<{ success: boolean; error?: string }>;
  getConfig: (name: string) => Promise<AutomationConfig | null>;
  saveScript: (
    name: string,
    events: AutomationEvent[],
  ) => Promise<{ success: boolean; error?: string }>;
  onStatus: (callback: (status: string) => void) => () => void;
  offStatus: () => void;
  getScriptEvents: (
    name: string,
  ) => Promise<{
    success: boolean;
    events?: any[];
    isolation?: boolean;
    error?: string;
  }>;
  getScreenshot: () => Promise<{ data: string } | { error: string }>;
  onOCRRequest: (
    callback: (data: {
      requestId: string;
      screenshotData: string;
      region: { x: number; y: number; w: number; h: number };
      expectedText: string;
    }) => void,
  ) => void;
  ocrResponse: (data: {
    requestId: string;
    text: string;
    matched: boolean;
    error?: string;
  }) => void;
  offOCRRequest: () => void;
  getOcrResults: (name: string) => Promise<OcrResultEntry[]>;
  clearOcrResults: (name: string) => Promise<{ success: boolean }>;
}

export interface SpeedAPI {
  start: () => Promise<{ success: boolean; error?: string }>;
  stop: () => Promise<{ success: boolean }>;
  setSpeed: (
    multiplier: number,
  ) => Promise<{ success: boolean; error?: string }>;
  getStatus: () => Promise<{
    active: boolean;
    speed: number;
    pid: number | null;
  }>;
  onShortcut: (callback: (key: "F1" | "F2") => void) => () => void;
  onStateChanged: (
    callback: (status: {
      active: boolean;
      speed: number;
      pid: number | null;
    }) => void,
  ) => () => void;
  notifyFlashChanged: () => void;
}

export interface IElectronAPI {
  getPlatform: () => string;
  windowControls: (action: "minimize" | "maximize" | "close") => void;
  setOpacity: (opacity: number) => void;
  checkFlash: () => Promise<boolean>;
  updateBossKey: (key: string) => void;
  openExternal: (url: string) => void;
  getAppVersion: () => Promise<string>;
  getExperimentalFlags: () => Promise<{ flashStability: boolean }>;
  setExperimentalFlags: (flags: {
    flashStability?: boolean;
  }) => Promise<{ success: boolean; flags?: { flashStability: boolean }; error?: string }>;
  getFlashPid: () => Promise<number | null>;
  getKeymapConfig: () => Promise<{
    enabled: boolean;
    mappings: Array<{ source: string; target: string }>;
  }>;
  saveKeymapConfig: (config: {
    enabled: boolean;
    mappings: Array<{ source: string; target: string }>;
  }) => void;
  suspendBossKey: () => void;
  resumeBossKey: () => void;
  suspendKeymap: () => void;
  resumeKeymap: () => void;
  ocr: (
    imageBase64: string,
  ) => Promise<{ success: boolean; data?: OCRResponseData; error?: string }>;
  ocrGetStatus: () => Promise<{ installed: boolean }>;
  ocrInstall: () => Promise<{ success: boolean }>;
  ocrUninstall: () => Promise<{ success: boolean }>;
  checkUpdate: () => Promise<{
    available: boolean;
    version?: string;
    url?: string;
    assetName?: string;
    source?: string;
    error?: string;
  }>;
  downloadUpdate: (
    url: string,
  ) => Promise<{ success: boolean; error?: string }>;
  onUpdateProgress: (callback: (percent: number) => void) => void;
  offUpdateProgress: () => void;
  onOcrInstallProgress: (callback: (percent: number) => void) => void;
  offOcrInstallProgress: () => void;
  automation: AutomationAPI;
  speed: SpeedAPI;
}

declare global {
  interface Window {
    electron: IElectronAPI;
  }
  namespace JSX {
    interface IntrinsicElements {
      webview: any;
    }
  }
}
