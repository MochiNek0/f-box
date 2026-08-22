// Window fullscreen state, mirrored from main. Deliberately NOT persisted:
// the window never starts fullscreen, so a remembered `true` would just leave
// the UI hiding chrome that is actually visible.
//
// Lives in a store rather than App state because both App (which drops the
// title/tab bars) and GameView (which turns its toolbar into a hover-revealed
// overlay) need it.
import { create } from "zustand";

interface FullscreenState {
  isFullscreen: boolean;
  // Whether the hover-revealed toolbar is currently showing (fullscreen only).
  chromeRevealed: boolean;
  setFullscreen: (value: boolean) => void;
  setChromeRevealed: (value: boolean) => void;
}

export const useFullscreenStore = create<FullscreenState>((set) => ({
  isFullscreen: false,
  chromeRevealed: false,
  // Entering or leaving fullscreen always starts with the toolbar hidden.
  // Resetting here rather than in a GameView effect keeps it correct even when
  // the mouse is nowhere near the toolbar, which is the common case for F11.
  setFullscreen: (value) => set({ isFullscreen: value, chromeRevealed: false }),
  setChromeRevealed: (value) => set({ chromeRevealed: value }),
}));

// App-lifetime listener for fullscreen changes from main (F11, or the OS).
let initialized = false;
export function initFullscreenListener() {
  if (initialized) return;
  initialized = true;
  window.electron?.onFullscreenChanged?.((value) => {
    useFullscreenStore.getState().setFullscreen(value);
  });
}
