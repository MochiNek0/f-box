import { create } from "zustand";

interface SpeedStatus {
  active: boolean;
  speed: number;
  pendingMultiplier: number;
  isLoading: boolean;
  statusMessage: string;
}

interface SpeedActions {
  fetchStatus: () => Promise<void>;
  startSpeed: () => Promise<void>;
  stopSpeed: () => Promise<void>;
  setPendingMultiplier: (multiplier: number) => void;
  applyPendingSpeed: () => Promise<void>;
  resetToOriginalSpeed: () => Promise<void>;
  setSpeed: (multiplier: number) => Promise<void>;
  clearMessage: () => void;
}

export const useSpeedStore = create<SpeedStatus & SpeedActions>((set, get) => ({
  active: false,
  speed: 1.0,
  pendingMultiplier: 4,
  isLoading: false,
  statusMessage: "",

  fetchStatus: async () => {
    if (!window.electron?.speed) return;
    const status = await window.electron.speed.getStatus();
    set((state) => ({
      active: status.active,
      speed: status.speed,
      pendingMultiplier:
        status.active && status.speed > 1 ? status.speed : state.pendingMultiplier,
    }));
  },

  startSpeed: async () => {
    set({ isLoading: true, statusMessage: "正在注入变速..." });
    const result = await window.electron.speed.start();
    if (result.success) {
      const pendingMultiplier = get().pendingMultiplier;
      const speedResult = await window.electron.speed.setSpeed(pendingMultiplier);
      if (speedResult.success) {
        set({
          active: true,
          speed: pendingMultiplier,
          statusMessage: `已启用 ${pendingMultiplier}x 变速`,
        });
      } else {
        set({
          active: true,
          statusMessage: speedResult.error || "变速写入失败",
        });
      }
    } else {
      set({ statusMessage: result.error || "启动失败" });
    }
    set({ isLoading: false });
    setTimeout(() => get().clearMessage(), 4000);
  },

  stopSpeed: async () => {
    set({ isLoading: true, statusMessage: "正在停止变速..." });
    await window.electron.speed.stop();
    set({
      active: false,
      speed: 1.0,
      statusMessage: "变速已停止",
      isLoading: false,
    });
    setTimeout(() => get().clearMessage(), 3000);
  },

  setPendingMultiplier: (multiplier: number) => {
    if (Number.isFinite(multiplier) && multiplier > 0) {
      set({ pendingMultiplier: multiplier });
    }
  },

  applyPendingSpeed: async () => {
    const { active, pendingMultiplier, startSpeed, setSpeed } = get();
    if (!active) {
      await startSpeed();
      return;
    }
    await setSpeed(pendingMultiplier);
  },

  resetToOriginalSpeed: async () => {
    if (!get().active) {
      set({ speed: 1.0 });
      return;
    }
    await get().setSpeed(1.0);
  },

  setSpeed: async (multiplier: number) => {
    if (!Number.isFinite(multiplier) || multiplier <= 0) {
      return;
    }
    if (get().active) {
      const result = await window.electron.speed.setSpeed(multiplier);
      if (result.success) {
        set({
          speed: multiplier,
          statusMessage:
            multiplier === 1
              ? "已切回原速"
              : `速度已设置为 ${multiplier}x`,
        });
      } else {
        set({ statusMessage: result.error || "速度设置失败" });
      }
      setTimeout(() => get().clearMessage(), 2000);
    } else {
      set({ speed: multiplier });
    }
  },

  clearMessage: () => set({ statusMessage: "" }),
}));
