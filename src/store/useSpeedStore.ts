import { create } from "zustand";

interface SpeedStatus {
  active: boolean;
  speed: number;
  isLoading: boolean;
  statusMessage: string;
}

interface SpeedActions {
  fetchStatus: () => Promise<void>;
  startSpeed: () => Promise<void>;
  stopSpeed: () => Promise<void>;
  setSpeed: (multiplier: number) => Promise<void>;
  clearMessage: () => void;
}

export const useSpeedStore = create<SpeedStatus & SpeedActions>((set, get) => ({
  active: false,
  speed: 1.0,
  isLoading: false,
  statusMessage: "",

  fetchStatus: async () => {
    if (!window.electron?.speed) return;
    const status = await window.electron.speed.getStatus();
    set({ active: status.active, speed: status.speed });
  },

  startSpeed: async () => {
    set({ isLoading: true, statusMessage: "正在注入变速齿轮..." });
    const result = await window.electron.speed.start();
    if (result.success) {
      const currentSpeed = get().speed;
      await window.electron.speed.setSpeed(currentSpeed);
      set({ active: true, statusMessage: "✅ 变速齿轮已启动" });
    } else {
      set({ statusMessage: `❌ ${result.error || "启动失败"}` });
    }
    set({ isLoading: false });
    setTimeout(() => get().clearMessage(), 4000);
  },

  stopSpeed: async () => {
    set({ isLoading: true, statusMessage: "正在停止变速..." });
    await window.electron.speed.stop();
    set({ active: false, speed: 1.0, statusMessage: "⏹️ 变速齿轮已停止", isLoading: false });
    setTimeout(() => get().clearMessage(), 3000);
  },

  setSpeed: async (multiplier: number) => {
    set({ speed: multiplier });
    if (get().active) {
      const result = await window.electron.speed.setSpeed(multiplier);
      if (result.success) {
        set({ statusMessage: `⚡ 速度已设置为 ${multiplier}x` });
      } else {
        set({ statusMessage: `❌ ${result.error}` });
      }
      setTimeout(() => get().clearMessage(), 2000);
    }
  },

  clearMessage: () => set({ statusMessage: "" }),
}));
