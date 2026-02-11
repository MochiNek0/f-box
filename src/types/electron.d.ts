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
}

declare global {
  interface Window {
    electron: IElectronAPI;
  }
}
