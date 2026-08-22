import { create } from "zustand";
import { persist } from "zustand/middleware";

export type GameResolutionMode = "auto" | "native";

interface SettingsState {
  bossKey: string;
  setBossKey: (key: string) => void;
  gameResolutionMode: GameResolutionMode;
  setGameResolutionMode: (mode: GameResolutionMode) => void;
  // "Game area only" crop, keyed by game URL. Off by default: not every page
  // has a detectable game surface, and switching modes invalidates scripts
  // recorded in the other one.
  gameCropEnabled: Record<string, boolean>;
  setGameCrop: (url: string, enabled: boolean) => void;
  // Wallpaper shown around the cropped game instead of black. Only the file
  // path is persisted — the bytes are read on demand, since a data URL would
  // blow past what localStorage can hold.
  cropBackgroundPath: string | null;
  setCropBackgroundPath: (filePath: string | null) => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      bossKey: "Escape", // Default boss key
      setBossKey: (key: string) => set({ bossKey: key }),
      gameResolutionMode: "auto",
      setGameResolutionMode: (mode: GameResolutionMode) =>
        set({ gameResolutionMode: mode }),
      gameCropEnabled: {},
      setGameCrop: (url: string, enabled: boolean) =>
        set((state) => ({
          gameCropEnabled: { ...state.gameCropEnabled, [url]: enabled },
        })),
      cropBackgroundPath: null,
      setCropBackgroundPath: (filePath: string | null) =>
        set({ cropBackgroundPath: filePath }),
    }),
    {
      name: "settings-storage",
    },
  ),
);
