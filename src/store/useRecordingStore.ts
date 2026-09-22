// Renderer-side automation recording session. Input capture happens in
// RecordingOverlay (a transparent layer over the game webview); events
// accumulate here and are saved as a v4 script (meta sentinel + events) when
// recording stops (F10 or the toolbar stop button). Switching to another game
// tab mid-recording opens a second instance slot and is recorded as a
// `switch` event, so one script can drive two game instances (双开).
import { create } from "zustand";
import type { AutomationEvent, GameGeometry } from "../types/electron";
import { getGameTabIndex, getGeometryForTab } from "./gameViewRegistry";
import { useTabStore } from "./useTabStore";

// Renderer-recorded script version. Must stay in sync with the electron-side
// versioning (automation-geometry.cts): v3 = normalized nx/ny mouse coords +
// Electron keyCodes in `key` (no vk/sc); v4 = one geometry per instance slot
// in the meta sentinel + `switch` events.
const SCRIPT_VERSION = 4;

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
  // One entry per instance slot (双开): the game tab it belongs to, its
  // latest geometry, and its tab-bar position relative to slot 0's. Slot 0 is
  // the tab recording started on.
  slots: [] as {
    tabId: string;
    geometry: GameGeometry;
    tabOffset: number;
  }[],
  // Tab-bar position of slot 0, the origin every slot's offset is measured
  // from.
  baseTabIndex: 0,
  // Unsubscribe from the tab-switch watcher; non-null only while recording.
  unwatchTabs: null as (() => void) | null,
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

// The user switched tabs mid-recording: give the new game tab an instance
// slot and record the switch, so playback reproduces it. The switch is stored
// as an explicit instruction rather than as clicks on F-Box's own tab bar —
// tab ids and toolbar coordinates would not survive a replay on another
// window size or machine.
function switchRecordingTab(tabId: string): void {
  const { recordingTabId } = useRecordingStore.getState();
  if (!recordingTabId || tabId === recordingTabId) return;
  const geometry = getGeometryForTab(tabId);
  // The library tab (or a guest that isn't ready) has nothing to record into
  // — stay on the current slot. The overlay isn't mounted there, so nothing
  // is captured until the user comes back to a game tab.
  if (!geometry) return;

  let slot = session.slots.findIndex((s) => s.tabId === tabId);
  if (slot === -1) {
    slot = session.slots.length;
    // Bind this instance to WHERE it sits in the tab bar, not to the order it
    // was visited in, so switching 1 → 3 → 2 replays onto those same
    // instances. A tab with no live index (shouldn't happen — its geometry
    // just resolved) falls back to the visit order.
    const index = getGameTabIndex(tabId);
    const tabOffset =
      index >= 0 ? index - session.baseTabIndex : session.slots.length;
    session.slots.push({ tabId, geometry, tabOffset });
  } else {
    // Re-take the geometry: the window may have moved or resized since this
    // instance was last recorded into.
    session.slots[slot].geometry = geometry;
  }
  session.events.push({
    t: round3(recordingElapsedMs()),
    type: "switch",
    slot,
  });
  useRecordingStore.setState({ recordingTabId: tabId, geometry });
  // Move main's keyboard mirroring to the new guest, which now holds focus.
  window.electron.automation.setRecordingState(true, geometry.webContentsId);
}

interface RecordingState {
  // Game tab currently being recorded into (the active instance slot); null =
  // not recording. Follows the user across tab switches.
  recordingTabId: string | null;
  scriptName: string;
  // Geometry of the tab being recorded into (webContentsId + guest surface
  // size); used for forwarding injection and stored in the meta sentinel.
  // Re-taken on every tab switch.
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
    session.baseTabIndex = Math.max(0, getGameTabIndex(tabId));
    session.slots = [{ tabId, geometry, tabOffset: 0 }];
    // Watch for tab switches for the whole session: switching to another game
    // tab is itself a recorded instruction (see switchRecordingTab).
    session.unwatchTabs?.();
    session.unwatchTabs = useTabStore.subscribe((state, prev) => {
      if (state.activeTabId !== prev.activeTabId) {
        switchRecordingTab(state.activeTabId);
      }
    });
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
    const targets = session.slots.map((s) => s.geometry);
    const slotOffsets = session.slots.map((s) => s.tabOffset);
    session.events = [];
    session.slots = [];
    session.unwatchTabs?.();
    session.unwatchTabs = null;
    set({
      recordingTabId: null,
      scriptName: "",
      geometry: null,
      breakpointPending: false,
    });
    window.electron.automation.setRecordingState(false);
    // Meta sentinel shape matches automation-geometry.cts MetaEvent:
    // `geometry` is slot 0, `targets` lists every instance the recording
    // touched (one entry unless the user switched tabs), and `slotOffsets`
    // says where each one sat in the tab bar relative to slot 0.
    const meta: AutomationEvent = {
      t: 0,
      type: "meta",
      version: SCRIPT_VERSION,
      geometry: targets[0] ?? geometry,
      targets,
      slotOffsets,
    };
    return window.electron.automation.saveScript(scriptName, [meta, ...events]);
  },
}));
