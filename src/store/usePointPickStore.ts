// Coordinates a one-off "click a point on the game" request from a Settings
// tab (e.g. ClickerTab) to the GameView of the target tab. GameView renders a
// PointPickOverlay when `pending.tabId` matches its own tab id; the overlay
// resolves the request via `complete`/`cancel`.
import { create } from "zustand";

interface PendingPick {
  tabId: string;
  stepId: string;
}

interface PickResult {
  stepId: string;
  nx: number;
  ny: number;
}

interface PointPickState {
  pending: PendingPick | null;
  result: PickResult | null;
  start: (tabId: string, stepId: string) => void;
  complete: (nx: number, ny: number) => void;
  cancel: () => void;
  consumeResult: () => PickResult | null;
}

export const usePointPickStore = create<PointPickState>((set, get) => ({
  pending: null,
  result: null,

  start: (tabId, stepId) => set({ pending: { tabId, stepId }, result: null }),

  complete: (nx, ny) => {
    const pending = get().pending;
    if (!pending) return;
    set({ pending: null, result: { stepId: pending.stepId, nx, ny } });
  },

  cancel: () => set({ pending: null }),

  consumeResult: () => {
    const r = get().result;
    if (r) set({ result: null });
    return r;
  },
}));
