export interface StopConditionConfig {
  enabled: boolean;
  x: number;
  y: number;
  color: string;
  repeatCount?: number;
}

export interface AutomationAPI {
  startRecord: (name: string) => Promise<{ success: boolean; error?: string }>;
  stopRecord: () => Promise<{ success: boolean }>;
  startPlay: (name: string) => Promise<{ success: boolean; error?: string }>;
  stopPlay: () => Promise<{ success: boolean }>;
  pickColor: () => Promise<{ x: number; y: number; color: string } | null>;
  listScripts: () => Promise<string[]>;
  deleteScript: (name: string) => Promise<{ success: boolean; error?: string }>;
  saveConfig: (
    name: string,
    config: StopConditionConfig,
  ) => Promise<{ success: boolean; error?: string }>;
  getConfig: (name: string) => Promise<StopConditionConfig | null>;
  onStatus: (callback: (status: string) => void) => void;
  offStatus: () => void;
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
  automation: AutomationAPI;
}

declare global {
  interface Window {
    electron: IElectronAPI;
  }
}
