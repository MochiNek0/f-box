export interface AutomationConfig {
  repeatCount?: number;
}

export interface AutomationAPI {
  startRecord: (name: string) => Promise<{ success: boolean; error?: string }>;
  stopRecord: () => Promise<{ success: boolean }>;
  startPlay: (name: string) => Promise<{ success: boolean; error?: string }>;
  stopPlay: () => Promise<{ success: boolean }>;
  listScripts: () => Promise<string[]>;
  deleteScript: (name: string) => Promise<{ success: boolean; error?: string }>;
  saveConfig: (
    name: string,
    config: AutomationConfig,
  ) => Promise<{ success: boolean; error?: string }>;
  getConfig: (name: string) => Promise<AutomationConfig | null>;
  onStatus: (callback: (status: string) => void) => void;
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
  getScreenshot: () => Promise<string | { error: string }>;
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
}

export interface IElectronAPI {
  windowControls: (action: "minimize" | "maximize" | "close") => void;
  setOpacity: (opacity: number) => void;
  checkFlash: () => Promise<boolean>;
  updateBossKey: (key: string) => void;
  openExternal: (url: string) => void;
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
  ) => Promise<{ success: boolean; data?: any; error?: string }>;
  ocrGetStatus: () => Promise<{ installed: boolean }>;
  ocrInstall: () => Promise<{ success: boolean }>;
  ocrUninstall: () => Promise<{ success: boolean }>;
  automation: AutomationAPI;
}

declare global {
  interface Window {
    electron: IElectronAPI;
  }
}
