// Renderer-side automation recording session. Input capture happens in
// RecordingOverlay (a transparent layer over the game webview); events
// accumulate here and are saved as a v3 script (meta sentinel + events) when
// recording stops (F10 or the toolbar stop button).
import { create } from "zustand";
import type { AutomationEvent, GameGeometry } from "../types/electron";

// Renderer-recorded script version. Must stay in sync with the electron-side
// versioning (automation-geometry.cts): v3 = normalized nx/ny mouse coords +
// Electron keyCodes in `key` (no vk/sc).
const SCRIPT_VERSION = 3;

export const round3 = (n: number) => Math.round(n * 1000) / 1000;

// Mutable session internals. They are touched at input-event rate (every
// mousemove), so they live outside the reactive store state — pushing through
// zustand `set` would notify subscribers on every event for no benefit.
const session = {
  events: [] as AutomationEvent[],
  startedAt: 0,
  pausedTotal: 0,
  pauseStart: 0,
  pendingTTrigger: 0,
};

// Recording clock: milliseconds since start, excluding time spent paused in
// the F9 breakpoint-selection flow.
export function recordingElapsedMs(): number {
  return performance.now() - session.startedAt - session.pausedTotal;
}

// Append a recorded event. Mousemove bursts (<16ms apart) update the last
// event in place instead of appending, mirroring the old AHK recorder.
export function pushRecordedEvent(evt: AutomationEvent): void {
  const last = session.events[session.events.length - 1];
  if (
    evt.type === "mousemove" &&
    last &&
    last.type === "mousemove" &&
    evt.t - last.t < 16
  ) {
    last.t = evt.t;
    last.x = evt.x;
    last.y = evt.y;
    last.nx = evt.nx;
    last.ny = evt.ny;
    return;
  }
  session.events.push(evt);
}

interface RecordingState {
  // Tab whose GameView hosts the recording overlay; null = not recording.
  recordingTabId: string | null;
  scriptName: string;
  // Geometry snapshot taken at record start (webContentsId + guest surface
  // size); used for forwarding injection and stored in the meta sentinel.
  geometry: GameGeometry | null;
  // F9 breakpoint region selection in progress — the recording clock is
  // paused and the OCR selection overlay is shown.
  breakpointPending: boolean;
  start: (tabId: string, name: string, geometry: GameGeometry) => void;
  beginBreakpoint: () => void;
  completeBreakpoint: (data: {
    x: number;
    y: number;
    w: number;
    h: number;
    text: string;
  }) => void;
  cancelBreakpoint: () => void;
  stopAndSave: () => Promise<{ success: boolean; error?: string }>;
}

export const useRecordingStore = create<RecordingState>((set, get) => ({
  recordingTabId: null,
  scriptName: "",
  geometry: null,
  breakpointPending: false,

  start: (tabId, name, geometry) => {
    session.events = [];
    session.startedAt = performance.now();
    session.pausedTotal = 0;
    session.pauseStart = 0;
    session.pendingTTrigger = 0;
    set({
      recordingTabId: tabId,
      scriptName: name,
      geometry,
      breakpointPending: false,
    });
    // Tell main so F3-F5 hotkey playback is ignored (and any active playback
    // is stopped) while recording, and so keyboard capture attaches to the
    // guest (which keeps focus — physical keys reach the game natively).
    window.electron.automation.setRecordingState(true, geometry.webContentsId);
  },

  beginBreakpoint: () => {
    if (get().breakpointPending || !get().recordingTabId) return;
    session.pendingTTrigger = round3(recordingElapsedMs());
    session.pauseStart = performance.now();
    set({ breakpointPending: true });
  },

  completeBreakpoint: (data) => {
    if (!get().breakpointPending) return;
    session.pausedTotal += performance.now() - session.pauseStart;
    session.events.push({
      t: round3(recordingElapsedMs()),
      t_trigger: session.pendingTTrigger,
      type: "breakpoint",
      x: data.x,
      y: data.y,
      w: data.w,
      h: data.h,
      text: data.text,
    });
    set({ breakpointPending: false });
  },

  cancelBreakpoint: () => {
    if (!get().breakpointPending) return;
    session.pausedTotal += performance.now() - session.pauseStart;
    set({ breakpointPending: false });
  },

  stopAndSave: async () => {
    const { recordingTabId, scriptName, geometry } = get();
    if (!recordingTabId || !geometry) {
      return { success: false, error: "未在录制中" };
    }
    const events = session.events;
    session.events = [];
    set({
      recordingTabId: null,
      scriptName: "",
      geometry: null,
      breakpointPending: false,
    });
    window.electron.automation.setRecordingState(false);
    // Meta sentinel shape matches automation-geometry.cts MetaEvent.
    const meta: AutomationEvent = {
      t: 0,
      type: "meta",
      version: SCRIPT_VERSION,
      geometry,
    };
    return window.electron.automation.saveScript(scriptName, [meta, ...events]);
  },
}));
