import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  useRecordingStore,
  pushRecordedEvent,
  recordingElapsedMs,
  round3,
} from "../../../store/useRecordingStore";
import { domCodeToKeyCode } from "../../../utils/keyCodes";
import type {
  AutomationEvent,
  GuestRecordReport,
  InjectedInputEvent,
} from "../../../types/electron";

// Transparent MOUSE-capture layer rendered by GameView over the game webview
// while its tab is recording. Physical mouse events land here (the webview is
// pointer-events:none during recording) and are forwarded to main for live
// injection into the guest via sendInputEvent — the same pipeline playback
// uses.
//
// WHAT GETS RECORDED depends on the mode, decided by a short probe:
//
// - "guest" (unified) mode: the guest-side observer (guest-record-preload)
//   echoes every mouse event the game actually receives — forwarded
//   injections AND physical events routed to the guest while it holds mouse
//   capture. Those echoes are the single recording source, so the recorded
//   stream is BY CONSTRUCTION what the game experienced, and a press is
//   injected as a genuinely HELD mouseDown: long-press and drag behave the
//   same while recording as they will at playback. The release either comes
//   back through this overlay (forwarded as a real mouseUp) or goes straight
//   to the capturing guest — both are echoed and recorded at their true time.
//
// - "legacy" mode (fallback, no echo arrived within the probe window — e.g.
//   the game frame is unreachable from the guest preload): this overlay
//   records what it sees, and a press injects a COMPLETE click (down+up).
//   A held injected mouseDown would make PPAPI Flash grab the mouse and
//   swallow the physical release, which legacy mode has no other way to
//   observe. The script still stores the true down@t1 + up@t2 (playback
//   replays a proper hold); the trade-off is that the game only "clicks"
//   during recording.
//
// - "probe": undecided (first ~300ms after the first forwarded event).
//   Presses are injected held (converted to a click if legacy wins) and
//   events are buffered locally — flushed into the session if legacy wins,
//   discarded when the guest echo confirms (the echoes carry the same
//   events).
//
// Keyboard deliberately does NOT go through this overlay: the guest keeps
// focus for the whole recording (injected/physical keyboard only reaches
// Flash on a focused guest), so physical keys hit the game natively and main
// mirrors them back here via before-input-event for recording. That's why
// every mousedown re-asserts guest focus instead of taking it.
//
// F9 = set an OCR breakpoint (pauses the clock, opens the selection overlay).
// F10 = stop recording and save. Both arrive from main (globalShortcut, with
// a before-input-event fallback), so they work regardless of DOM focus.

const MOUSE_BUTTONS: Record<number, "left" | "middle" | "right"> = {
  0: "left",
  1: "middle",
  2: "right",
};

type RecordMode = "probe" | "guest" | "legacy";

// How long after the first forwarded event to wait for a guest echo before
// falling back to legacy recording. Covers the forward->inject->dispatch->
// sendToHost round trip with margin.
const PROBE_TIMEOUT_MS = 300;

// In guest mode, warn if a forwarded mousedown is never echoed — it means
// part of the game surface is invisible to the guest observer and the
// recording is losing events there.
const ECHO_LOSS_TIMEOUT_MS = 400;

interface RecordingOverlayProps {
  // Restore keyboard focus to the game webview (host-side element focus).
  focusGuest: () => void;
  // Subscribe to guest-observer echoes for this tab; returns an unsubscribe.
  registerGuestReportHandler: (
    cb: (r: GuestRecordReport) => void,
  ) => () => void;
}

export const RecordingOverlay: React.FC<RecordingOverlayProps> = ({
  focusGuest,
  registerGuestReportHandler,
}) => {
  const breakpointPending = useRecordingStore((s) => s.breakpointPending);
  const overlayRef = useRef<HTMLDivElement | null>(null);
  const ocrInstalledRef = useRef(false);
  const modeRef = useRef<RecordMode>("probe");
  const [modeLabel, setModeLabel] = useState<RecordMode>("probe");
  const probeTimerRef = useRef<number | null>(null);
  const probeBufferRef = useRef<AutomationEvent[]>([]);
  // Buttons the guest has echoed a mousedown for without a mouseup yet —
  // makes recorded releases idempotent (physical up routed to the capturing
  // guest AND a forwarded up can both echo; only the first is recorded).
  const guestPressedRef = useRef<Set<"left" | "middle" | "right">>(new Set());
  const echoLossTimerRef = useRef<number | null>(null);
  // The currently-pressed mouse button (with its latest coords), if any. In
  // guest/probe mode the press injected a HELD mouseDown, so the guest may
  // grab mouse capture and the physical release can bypass this overlay —
  // the guest echo clears this instead. Whichever release path runs first
  // wins; the rest no-op.
  const activePressRef = useRef<{
    button: "left" | "middle" | "right";
    x: number;
    y: number;
    nx: number;
    ny: number;
  } | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const warningTimerRef = useRef<number | null>(null);

  // Cache OCR availability so the F9 handler can decide synchronously.
  useEffect(() => {
    let mounted = true;
    window.electron.ocrGetStatus().then((s) => {
      if (mounted) ocrInstalledRef.current = s.installed;
    });
    return () => {
      mounted = false;
      if (warningTimerRef.current) window.clearTimeout(warningTimerRef.current);
      if (probeTimerRef.current) window.clearTimeout(probeTimerRef.current);
      if (echoLossTimerRef.current)
        window.clearTimeout(echoLossTimerRef.current);
    };
  }, []);

  // Keep keyboard focus on the GUEST (on mount, and take it back after the
  // OCR selection overlay steals it during breakpoint selection).
  useEffect(() => {
    if (!breakpointPending) focusGuest();
  }, [breakpointPending, focusGuest]);

  const showWarning = useCallback((text: string) => {
    setWarning(text);
    if (warningTimerRef.current) window.clearTimeout(warningTimerRef.current);
    warningTimerRef.current = window.setTimeout(() => setWarning(null), 3000);
  }, []);

  const isPaused = () => useRecordingStore.getState().breakpointPending;

  const forward = useCallback((event: InjectedInputEvent) => {
    const geometry = useRecordingStore.getState().geometry;
    if (!geometry) return;
    window.electron.automation.forwardInput({
      webContentsId: geometry.webContentsId,
      event,
    });
  }, []);

  // Overlay-relative position -> normalized fraction + guest coordinates.
  const toCoords = useCallback((clientX: number, clientY: number) => {
    const el = overlayRef.current;
    const geometry = useRecordingStore.getState().geometry;
    if (!el || !geometry) return null;
    const rect = el.getBoundingClientRect();
    const nx = (clientX - rect.left) / (rect.width || 1);
    const ny = (clientY - rect.top) / (rect.height || 1);
    return {
      nx: round3(nx),
      ny: round3(ny),
      x: Math.round(nx * geometry.renderWidth),
      y: Math.round(ny * geometry.renderHeight),
    };
  }, []);

  // Record an overlay-observed event: buffered while probing, stored in
  // legacy mode, dropped in guest mode (the guest echo is the recorder).
  const recordLocal = useCallback((evt: AutomationEvent) => {
    if (modeRef.current === "guest") return;
    if (modeRef.current === "probe") probeBufferRef.current.push(evt);
    else pushRecordedEvent(evt);
  }, []);

  // Probe timed out with no guest echo — the guest observer can't see the
  // game's input, so fall back to overlay-observed recording.
  const latchLegacy = useCallback(() => {
    if (modeRef.current !== "probe") return;
    modeRef.current = "legacy";
    setModeLabel("legacy");
    probeTimerRef.current = null;
    for (const evt of probeBufferRef.current) pushRecordedEvent(evt);
    probeBufferRef.current = [];
    // A press injected as HELD while probing has no observable release in
    // legacy mode — convert it to the legacy full click by injecting the up
    // now. The real release is still recorded at its true time by the
    // overlay's pointerup paths.
    const p = activePressRef.current;
    if (p) {
      forward({
        type: "mouseUp",
        x: p.x,
        y: p.y,
        button: p.button,
        clickCount: 1,
      });
    }
    console.log("[REC] no guest echo — legacy (click-injection) recording");
  }, [forward]);

  // Start the probe countdown at the first forwarded event.
  const armProbe = useCallback(() => {
    if (modeRef.current !== "probe" || probeTimerRef.current != null) return;
    probeTimerRef.current = window.setTimeout(latchLegacy, PROBE_TIMEOUT_MS);
  }, [latchLegacy]);

  // Handle the end of the tracked press. `c` is the release coords; when
  // omitted we reuse the press's last known position (a still press releases
  // in place).
  const releaseActivePress = useCallback(
    (c?: { x: number; y: number; nx: number; ny: number }) => {
      const p = activePressRef.current;
      if (!p) return;
      activePressRef.current = null;
      const at = c ?? p;
      if (modeRef.current === "legacy") {
        // The guest already got a COMPLETE click at press time — record only.
        recordLocal({
          t: round3(recordingElapsedMs()),
          type: "mouseup",
          button: p.button,
          x: at.x,
          y: at.y,
          nx: at.nx,
          ny: at.ny,
        });
        return;
      }
      // guest/probe: the guest is holding an injected mouseDown — release it
      // at the TRUE release time. In guest mode the echo records it; while
      // probing, record locally so the buffer stays complete for a legacy
      // flush.
      forward({ type: "mouseMove", x: at.x, y: at.y });
      forward({
        type: "mouseUp",
        x: at.x,
        y: at.y,
        button: p.button,
        clickCount: 1,
      });
      if (modeRef.current === "probe") {
        recordLocal({
          t: round3(recordingElapsedMs()),
          type: "mouseup",
          button: p.button,
          x: at.x,
          y: at.y,
          nx: at.nx,
          ny: at.ny,
        });
      }
    },
    [recordLocal, forward],
  );

  // Guest echoes: the recording source in guest mode. The first echo settles
  // the probe.
  const onGuestReport = useCallback(
    (r: GuestRecordReport) => {
      if (!r || isPaused()) return;
      if (modeRef.current === "legacy") return; // decided: echoes unusable/late
      if (modeRef.current === "probe") {
        if (probeTimerRef.current != null) {
          window.clearTimeout(probeTimerRef.current);
          probeTimerRef.current = null;
        }
        // The buffered events are the echoes-in-flight; drop them — every
        // one of them is (re)delivered through this handler.
        probeBufferRef.current = [];
        modeRef.current = "guest";
        setModeLabel("guest");
        console.log("[REC] guest echo confirmed — unified recording");
      }
      const geometry = useRecordingStore.getState().geometry;
      if (!geometry) return;
      const nx = round3(Math.min(1, Math.max(0, r.cx / (r.iw || 1))));
      const ny = round3(Math.min(1, Math.max(0, r.cy / (r.ih || 1))));
      const x = Math.round(nx * geometry.renderWidth);
      const y = Math.round(ny * geometry.renderHeight);
      const t = round3(recordingElapsedMs());
      if (r.kind === "mousemove") {
        pushRecordedEvent({ t, type: "mousemove", x, y, nx, ny });
        return;
      }
      if (r.kind === "mousewheel") {
        pushRecordedEvent({
          t,
          type: "mousewheel",
          button: (r.deltaY ?? 0) < 0 ? "up" : "down",
          x,
          y,
          nx,
          ny,
        });
        return;
      }
      const button = MOUSE_BUTTONS[r.button];
      if (!button) return;
      if (r.kind === "mousedown") {
        if (echoLossTimerRef.current != null) {
          window.clearTimeout(echoLossTimerRef.current);
          echoLossTimerRef.current = null;
        }
        guestPressedRef.current.add(button);
        pushRecordedEvent({ t, type: "mousedown", button, x, y, nx, ny });
      } else {
        // Idempotent release: record only the first echo for this press.
        if (!guestPressedRef.current.delete(button)) return;
        pushRecordedEvent({ t, type: "mouseup", button, x, y, nx, ny });
        // The physical release may have been routed straight to the capturing
        // guest — clear the tracked press so we don't inject a second up, and
        // re-assert keyboard focus like the overlay release paths do.
        if (activePressRef.current?.button === button) {
          activePressRef.current = null;
        }
        focusGuest();
      }
    },
    [focusGuest],
  );

  useEffect(
    () => registerGuestReportHandler(onGuestReport),
    [registerGuestReportHandler, onGuestReport],
  );

  const handleMouseMove = useCallback(
    (e: React.PointerEvent) => {
      if (isPaused()) return;
      const c = toCoords(e.clientX, e.clientY);
      if (!c) return;
      if (activePressRef.current) {
        if (e.buttons === 0) {
          // The release already happened but no pointerup reached us (can
          // occur around capture handoffs) — synthesize it now.
          releaseActivePress(c);
        } else {
          // Genuine drag: keep the press coords fresh for a synthesized
          // release.
          activePressRef.current = {
            button: activePressRef.current.button,
            ...c,
          };
        }
      }
      recordLocal({
        t: round3(recordingElapsedMs()),
        type: "mousemove",
        x: c.x,
        y: c.y,
        nx: c.nx,
        ny: c.ny,
      });
      armProbe();
      forward({ type: "mouseMove", x: c.x, y: c.y });
    },
    [toCoords, forward, recordLocal, armProbe, releaseActivePress],
  );

  const handleMouseDown = useCallback(
    (e: React.PointerEvent) => {
      if (isPaused()) return;
      const button = MOUSE_BUTTONS[e.button];
      if (!button) return;
      const c = toCoords(e.clientX, e.clientY);
      if (!c) return;
      // A prior press whose release we never received — pair it now so we
      // never stack two downs.
      if (activePressRef.current) releaseActivePress();
      activePressRef.current = { button, ...c };
      recordLocal({
        t: round3(recordingElapsedMs()),
        type: "mousedown",
        button,
        x: c.x,
        y: c.y,
        nx: c.nx,
        ny: c.ny,
      });
      armProbe();
      forward({ type: "mouseMove", x: c.x, y: c.y });
      forward({
        type: "mouseDown",
        x: c.x,
        y: c.y,
        button,
        clickCount: 1,
      });
      if (modeRef.current === "legacy") {
        // Legacy: complete the click immediately. A held injected mouseDown
        // makes PPAPI Flash grab the mouse and swallow the physical release,
        // which legacy mode (no guest echo) has no way to observe. The saved
        // script still stores the real down@t1 + up@t2; trade-off: the game
        // only "clicks" (does not visibly hold) during recording.
        forward({ type: "mouseUp", x: c.x, y: c.y, button, clickCount: 1 });
      } else if (modeRef.current === "guest") {
        // Unified: the button is genuinely held until the real release.
        // Watchdog: a down that is never echoed means this part of the game
        // surface is invisible to the guest observer.
        if (echoLossTimerRef.current != null) {
          window.clearTimeout(echoLossTimerRef.current);
        }
        echoLossTimerRef.current = window.setTimeout(() => {
          echoLossTimerRef.current = null;
          console.warn("[REC] forwarded mousedown was never echoed");
          showWarning("警告: 游戏未回传点击事件，该区域的录制可能缺失");
        }, ECHO_LOSS_TIMEOUT_MS);
      }
    },
    [toCoords, recordLocal, armProbe, releaseActivePress, forward, showWarning],
  );

  // Physical release observed by the overlay (guest did not grab the mouse,
  // or legacy mode where the guest never holds). Window-level capture-phase
  // listeners back up the element handler so a release that drifts off the
  // overlay is still caught.
  useEffect(() => {
    const onUp = (e: PointerEvent) => {
      if (!activePressRef.current) return;
      const c = toCoords(e.clientX, e.clientY);
      releaseActivePress(c ?? undefined);
      focusGuest();
    };
    window.addEventListener("pointerup", onUp, true);
    window.addEventListener("pointercancel", onUp, true);
    return () => {
      window.removeEventListener("pointerup", onUp, true);
      window.removeEventListener("pointercancel", onUp, true);
    };
  }, [toCoords, releaseActivePress, focusGuest]);

  // Native (non-passive) wheel listener so preventDefault can stop the game
  // area's scroll container from moving during recording.
  useEffect(() => {
    const el = overlayRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      if (isPaused()) return;
      const c = toCoords(e.clientX, e.clientY);
      if (!c) return;
      // DOM deltaY < 0 = wheel up. Matches playback: "down" -> -120.
      const button = e.deltaY < 0 ? "up" : "down";
      recordLocal({
        t: round3(recordingElapsedMs()),
        type: "mousewheel",
        button,
        x: c.x,
        y: c.y,
        nx: c.nx,
        ny: c.ny,
      });
      armProbe();
      forward({
        type: "mouseWheel",
        x: c.x,
        y: c.y,
        deltaY: button === "down" ? -120 : 120,
        canScroll: true,
      });
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [toCoords, forward, recordLocal, armProbe]);

  const handleStop = useCallback(async () => {
    // Mode still undecided at stop — no echo ever came; latch legacy so the
    // buffered events land in the session (also pairs a held injection).
    if (modeRef.current === "probe") {
      if (probeTimerRef.current != null) {
        window.clearTimeout(probeTimerRef.current);
        probeTimerRef.current = null;
      }
      latchLegacy();
    }
    const p = activePressRef.current;
    if (p && modeRef.current === "guest") {
      // Release the held injection and record the up directly — its echo
      // would only arrive after the session is closed and be dropped.
      activePressRef.current = null;
      forward({
        type: "mouseUp",
        x: p.x,
        y: p.y,
        button: p.button,
        clickCount: 1,
      });
      pushRecordedEvent({
        t: round3(recordingElapsedMs()),
        type: "mouseup",
        button: p.button,
        x: p.x,
        y: p.y,
        nx: p.nx,
        ny: p.ny,
      });
    } else {
      // Legacy: flush a still-held press so a click made right before F10
      // keeps its mouseup instead of ending the script on a lone mousedown.
      releaseActivePress();
    }
    guestPressedRef.current.clear();
    const result = await useRecordingStore.getState().stopAndSave();
    if (!result.success) {
      alert(`保存脚本失败: ${result.error}`);
    }
  }, [latchLegacy, releaseActivePress, forward]);

  const handleBreakpoint = useCallback(() => {
    if (!ocrInstalledRef.current) {
      // Mirrors the old STATUS|OCR_NOT_INSTALLED behavior: warn and ignore F9.
      showWarning("未安装 OCR 扩展，无法设置断点");
      return;
    }
    useRecordingStore.getState().beginBreakpoint();
  }, [showWarning]);

  // Keyboard: physical keys go straight into the focused guest; main mirrors
  // them here (before-input-event) for recording. F9/F10 arrive on their own
  // channel (globalShortcut or guest intercept). No injection needed — the
  // game already received the key.
  useEffect(() => {
    const detachKey = window.electron.automation.onRecordKey((data) => {
      if (isPaused() || data.isAutoRepeat) return;
      const keyCode = domCodeToKeyCode(data.code, data.key);
      if (!keyCode) {
        console.warn(
          `RecordingOverlay: unmapped key code "${data.code}", skipped`,
        );
        return;
      }
      pushRecordedEvent({
        t: round3(recordingElapsedMs()),
        type: data.type === "keyDown" ? "keydown" : "keyup",
        key: keyCode,
      });
    });
    const detachHotkey = window.electron.automation.onRecordHotkey((key) => {
      if (key === "F10") {
        void handleStop();
      } else {
        handleBreakpoint();
      }
    });
    return () => {
      detachKey();
      detachHotkey();
    };
  }, [handleStop, handleBreakpoint]);

  return (
    <div
      ref={overlayRef}
      className="absolute inset-0 z-10 outline-none cursor-crosshair"
      onPointerMove={handleMouseMove}
      onPointerDown={(e) => {
        // preventDefault keeps the click from moving DOM focus off the
        // webview — losing guest focus would cut physical keys off from the
        // game mid-recording. (Focus is asserted on mount / on release, not
        // here, to avoid re-focusing mid-gesture.)
        e.preventDefault();
        // Hold the physical pointer on the overlay for the whole gesture so a
        // release (or drag) that drifts off the overlay is still delivered to
        // onPointerUp below. When the guest grabs the mouse (held injection),
        // its capture wins and the release reaches us via the guest echo
        // instead.
        try {
          e.currentTarget.setPointerCapture(e.pointerId);
        } catch {
          // no pointer-capture support; the window listener still catches it
        }
        handleMouseDown(e);
      }}
      onPointerUp={(e) => {
        // Fires at the real release time. Idempotent with the other release
        // paths — whichever runs first clears the tracked press; the rest
        // no-op.
        const c = toCoords(e.clientX, e.clientY);
        releaseActivePress(c ?? undefined);
        try {
          e.currentTarget.releasePointerCapture(e.pointerId);
        } catch {
          // nothing to release
        }
        focusGuest();
      }}
      onContextMenu={(e) => e.preventDefault()}
    >
      {/* Visual recording hint: red outline + badge. */}
      <div className="absolute inset-0 pointer-events-none border-2 border-red-500/70" />
      <div className="absolute top-2 left-1/2 -translate-x-1/2 pointer-events-none flex items-center gap-2 bg-black/70 border border-red-500/40 rounded-full px-3 py-1">
        <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
        <span className="text-[10px] text-red-300 font-black uppercase tracking-widest">
          录制中 · F9 断点 · F10 停止保存
          {modeLabel === "guest" && " · 同步模式"}
          {modeLabel === "legacy" && " · 兼容模式"}
        </span>
      </div>
      {warning && (
        <div className="absolute top-10 left-1/2 -translate-x-1/2 pointer-events-none bg-amber-500/20 border border-amber-500/40 text-amber-200 text-xs rounded-full px-3 py-1">
          {warning}
        </div>
      )}
    </div>
  );
};
