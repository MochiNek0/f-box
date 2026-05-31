export interface AutomationEvent {
  t: number;
  type:
    | "keydown"
    | "keyup"
    | "mousedown"
    | "mouseup"
    | "mousemove"
    | "mousewheel"
    | "breakpoint";
  key?: string;
  button?: string;
  x?: number;
  y?: number;
  w?: number;
  h?: number;
  text?: string;
  t_trigger?: number;
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
  startRecord: (name: string) => Promise<{ success: boolean; error?: string }>;
  stopRecord: () => Promise<{ success: boolean }>;
  startPlay: (name: string) => Promise<{ success: boolean; error?: string }>;
  stopPlay: () => Promise<{ success: boolean }>;
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
  onBreakpointTriggered: (
    callback: (payload: { tTrigger: number }) => void,
  ) => void;
  offBreakpointTriggered: () => void;
  breakpointResume: (data: {
    x: number;
    y: number;
    w: number;
    h: number;
    text: string;
    tTrigger?: number;
  }) => Promise<{ success: boolean; error?: string }>;
  getScriptEvents: (
    name: string,
  ) => Promise<{ success: boolean; events?: any[]; error?: string }>;
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
}

export interface IElectronAPI {
  getPlatform: () => string;
  windowControls: (action: "minimize" | "maximize" | "close") => void;
  setOpacity: (opacity: number) => void;
  checkFlash: () => Promise<boolean>;
  updateBossKey: (key: string) => void;
  openExternal: (url: string) => void;
  getAppVersion: () => Promise<string>;
  getFlashPid: () => Promise<number>;
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
