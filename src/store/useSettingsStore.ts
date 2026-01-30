import { create } from "zustand";
import { persist } from "zustand/middleware";

interface SettingsState {
  bossKey: string;
  setBossKey: (key: string) => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      bossKey: "Escape", // Default boss key
      setBossKey: (key: string) => set({ bossKey: key }),
    }),
    {
      name: "settings-storage",
    },
  ),
);
