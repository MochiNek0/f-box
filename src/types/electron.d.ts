export interface IElectronAPI {
  windowControls: (action: "minimize" | "maximize" | "close") => void;
  setOpacity: (opacity: number) => void;
  checkFlash: () => Promise<boolean>;
  updateBossKey: (key: string) => void;
  openExternal: (url: string) => void;
}

declare global {
  interface Window {
    electron: IElectronAPI;
  }
}
