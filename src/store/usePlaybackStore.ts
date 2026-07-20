// Renderer-side view of automation playback state. Lives in a module-level
// store (not component state) because the Settings modal unmounts entirely
// when closed — and starting playback closes it — so component-local state
// would forget a run that is still going when the modal reopens.
import { create } from "zustand";

interface PlaybackState {
  isPlaying: boolean;
  playingScript: string | null;
  setPlaying: (script: string | null) => void;
}

export const usePlaybackStore = create<PlaybackState>((set) => ({
  isPlaying: false,
  playingScript: null,
  setPlaying: (script) =>
    set({ isPlaying: script !== null, playingScript: script }),
}));

// App-lifetime status listener keeping the store honest while no settings UI
// is mounted (playback can also start via F3-F5 hotkeys and end on its own).
let initialized = false;
export function initPlaybackStatusListener() {
  if (initialized) return;
  initialized = true;
  window.electron.automation.onStatus((status) => {
    const parts = status.split("|");
    if (parts[0] !== "STATUS") return;
    const action = parts[1];
    if (action === "HOTKEY_SLOT_STARTED") {
      let name = "";
      try {
        name = decodeURIComponent(parts[3] ?? "");
      } catch {
        name = parts[3] ?? "";
      }
      usePlaybackStore.getState().setPlaying(name || null);
      return;
    }
    if (
      action === "HOTKEY_SLOT_STOPPED" ||
      action === "STOPPED" ||
      action === "CONDITION_MET" ||
      action === "MAX_LOOPS_REACHED" ||
      action === "OCR_FAILED" ||
      action === "PROCESS_EXIT"
    ) {
      usePlaybackStore.getState().setPlaying(null);
    }
  });
}
