import { create } from "zustand";

// The speed hack feeds a scaled time delta to the game via timer hooks.
// Extreme multipliers make Flash's frame/timer logic overflow or starve and
// are a leading cause of plugin crashes, so cap the effective value and warn
// the user above the threshold where crashes get likely.
const MAX_SAFE_SPEED = 128;
const SPEED_WARN_THRESHOLD = 16;
const clampSpeed = (m: number) => Math.min(MAX_SAFE_SPEED, m);
const withCrashWarning = (m: number, base: string) =>
  m > SPEED_WARN_THRESHOLD ? `${base}（高倍速可能导致游戏崩溃）` : base;

// Single tracked timer for the transient status message — an untracked
// setTimeout from an earlier action would clear a newer message early.
let messageTimer: ReturnType<typeof setTimeout> | null = null;
const scheduleClearMessage = (clear: () => void, ms: number) => {
  if (messageTimer) clearTimeout(messageTimer);
  messageTimer = setTimeout(clear, ms);
};

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
  syncStatus: (status: { active: boolean; speed: number }) => void;
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
      const pendingMultiplier = clampSpeed(get().pendingMultiplier);
      const speedResult = await window.electron.speed.setSpeed(pendingMultiplier);
      if (speedResult.success) {
        set({
          active: true,
          speed: pendingMultiplier,
          statusMessage: withCrashWarning(
            pendingMultiplier,
            `已启用 ${pendingMultiplier}x 变速`,
          ),
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
    scheduleClearMessage(() => get().clearMessage(), 4000);
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
    scheduleClearMessage(() => get().clearMessage(), 3000);
  },

  setPendingMultiplier: (multiplier: number) => {
    if (Number.isFinite(multiplier) && multiplier > 0) {
      set({ pendingMultiplier: clampSpeed(multiplier) });
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
    multiplier = clampSpeed(multiplier);
    if (get().active) {
      const result = await window.electron.speed.setSpeed(multiplier);
      if (result.success) {
        set({
          speed: multiplier,
          statusMessage:
            multiplier === 1
              ? "已切回原速"
              : withCrashWarning(multiplier, `速度已设置为 ${multiplier}x`),
        });
      } else {
        set({ statusMessage: result.error || "速度设置失败" });
      }
      scheduleClearMessage(() => get().clearMessage(), 2000);
    } else {
      set({ speed: multiplier });
    }
  },

  // Applied when the main process pushes a state change the renderer didn't
  // initiate — the Flash-process watchdog auto re-injecting after a game
  // reload, or invalidating when the Flash process is gone. Keeps the UI
  // honest instead of stuck showing "变速中" over a dead injection.
  syncStatus: (status) => {
    set((state) => ({
      active: status.active,
      speed: status.speed,
      pendingMultiplier:
        status.active && status.speed > 1
          ? status.speed
          : state.pendingMultiplier,
      statusMessage: status.active
        ? `已自动恢复 ${status.speed}x 变速`
        : "游戏已重载，变速已复位",
    }));
    scheduleClearMessage(() => get().clearMessage(), 4000);
  },

  clearMessage: () => set({ statusMessage: "" }),
}));

const isEditableTarget = (target: EventTarget | null) => {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  const tagName = target.tagName.toLowerCase();
  return (
    tagName === "input" ||
    tagName === "textarea" ||
    tagName === "select" ||
    target.isContentEditable
  );
};

// App-lifetime listeners, kept out of the speed UI component on purpose: that
// UI lives in the title bar, which is unmounted in fullscreen, and F1/F2 plus
// the watchdog pushes have to keep working there.
let listenersInitialized = false;
export function initSpeedListeners() {
  if (listenersInitialized) return;
  listenersInitialized = true;

  void useSpeedStore.getState().fetchStatus();

  window.electron?.speed?.onShortcut?.((key) => {
    const { applyPendingSpeed, resetToOriginalSpeed } =
      useSpeedStore.getState();
    if (key === "F1") void applyPendingSpeed();
    else void resetToOriginalSpeed();
  });

  // Watchdog-driven state pushes (auto re-injection after a game reload, or
  // invalidation when the Flash process is gone).
  window.electron?.speed?.onStateChanged?.((status) => {
    useSpeedStore.getState().syncStatus(status);
  });

  window.addEventListener("keydown", (event) => {
    if (isEditableTarget(event.target)) return;
    if (event.key.toLowerCase() === "y") {
      event.preventDefault();
      void useSpeedStore.getState().applyPendingSpeed();
    }
  });
}
