import { create } from "zustand";
import { persist } from "zustand/middleware";

export type GameResolutionMode = "auto" | "native";

interface SettingsState {
  bossKey: string;
  setBossKey: (key: string) => void;
  gameResolutionMode: GameResolutionMode;
  setGameResolutionMode: (mode: GameResolutionMode) => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      bossKey: "Escape", // Default boss key
      setBossKey: (key: string) => set({ bossKey: key }),
      gameResolutionMode: "auto",
      setGameResolutionMode: (mode: GameResolutionMode) =>
        set({ gameResolutionMode: mode }),
    }),
    {
      name: "settings-storage",
    },
  ),
);
