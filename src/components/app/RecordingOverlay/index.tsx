import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  useRecordingStore,
  pushRecordedEvent,
  recordingElapsedMs,
  round3,
} from "../../../store/useRecordingStore";
import { domCodeToKeyCode } from "../../../utils/keyCodes";
import type { InjectedInputEvent } from "../../../types/electron";

// Transparent MOUSE-capture layer rendered by GameView over the game webview
// while its tab is recording. Mouse events are (1) recorded into the session
// (v3 format: normalized nx/ny) and (2) forwarded to main for live injection
// into the guest via sendInputEvent — the same pipeline playback uses.
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

interface RecordingOverlayProps {
  // Restore keyboard focus to the game webview (host-side element focus).
  focusGuest: () => void;
}

export const RecordingOverlay: React.FC<RecordingOverlayProps> = ({
  focusGuest,
}) => {
  const breakpointPending = useRecordingStore((s) => s.breakpointPending);
  const overlayRef = useRef<HTMLDivElement | null>(null);
  const ocrInstalledRef = useRef(false);
  // The currently-pressed mouse button (with its latest coords), if any. When
  // we inject a mouseDown into the guest it takes mouse capture and the
  // physical pointerup is never dispatched back to this overlay, so we cannot
  // rely on an onPointerUp firing. We track the press and guarantee a paired
  // release — caught by the window listener below, or synthesized on the next
  // press / when recording stops — so every recorded mousedown has a mouseup.
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

  // Record one mouse-button transition into the session (no injection).
  const record = useCallback(
    (
      type: "mousedown" | "mouseup",
      button: "left" | "middle" | "right",
      c: { x: number; y: number; nx: number; ny: number },
    ) => {
      pushRecordedEvent({
        t: round3(recordingElapsedMs()),
        type,
        button,
        x: c.x,
        y: c.y,
        nx: c.nx,
        ny: c.ny,
      });
    },
    [],
  );

  // Record the release of the tracked press. `c` is the release coords; when
  // omitted we reuse the press's last known position (a still press releases in
  // place).
  const releaseActivePress = useCallback(
    (c?: { x: number; y: number; nx: number; ny: number }) => {
      const p = activePressRef.current;
      if (!p) return;
      activePressRef.current = null;
      // Record only — the guest already got a COMPLETE click on press (see
      // handleMouseDown), so there is no held button to inject an "up" for.
      record("mouseup", p.button, c ?? p);
    },
    [record],
  );

  const handleMouseMove = useCallback(
    (e: React.PointerEvent) => {
      if (isPaused()) return;
      const c = toCoords(e.clientX, e.clientY);
      if (!c) return;
      // The real pointerup normally arrives (press injects a full click, so the
      // guest never grabs the mouse — see handleMouseDown). Safety net: a move
      // with no button pressed (buttons === 0) means the release already
      // happened, so record it now. While a button is genuinely still down (a
      // drag), keep the press coords fresh for a synthesized release.
      if (activePressRef.current) {
        if (e.buttons === 0) {
          releaseActivePress(c);
        } else {
          activePressRef.current = {
            button: activePressRef.current.button,
            ...c,
          };
        }
      }
      pushRecordedEvent({
        t: round3(recordingElapsedMs()),
        type: "mousemove",
        x: c.x,
        y: c.y,
        nx: c.nx,
        ny: c.ny,
      });
      forward({ type: "mouseMove", x: c.x, y: c.y });
    },
    [toCoords, forward, releaseActivePress],
  );

  const handleMouseDown = useCallback(
    (e: React.PointerEvent) => {
      if (isPaused()) return;
      const button = MOUSE_BUTTONS[e.button];
      if (!button) return;
      const c = toCoords(e.clientX, e.clientY);
      if (!c) return;
      // A prior press whose release we never received — synthesize it now so we
      // never stack two downs.
      if (activePressRef.current) releaseActivePress();
      activePressRef.current = { button, ...c };
      record("mousedown", button, c);
      // Live feedback: inject a COMPLETE click (down+up), NOT a held button.
      // A held mouseDown makes a PPAPI Flash guest grab the OS mouse, which
      // swallows the physical pointerup so the real release could never be
      // observed. Clicking-and-releasing here keeps the guest from grabbing the
      // mouse, so the genuine pointerup reaches this overlay and the recorded
      // mouseup lands at its TRUE time — even if the user then does nothing.
      // The saved script still stores the real down@t1 + up@t2, so playback
      // replays a proper press/hold. Trade-off: the game only "clicks" (does
      // not visibly hold) during recording.
      forward({ type: "mouseMove", x: c.x, y: c.y });
      forward({ type: "mouseDown", x: c.x, y: c.y, button, clickCount: 1 });
      forward({ type: "mouseUp", x: c.x, y: c.y, button, clickCount: 1 });
    },
    [toCoords, record, releaseActivePress, forward],
  );

  // Record the real release. Because press injects a full click (never a held
  // button), the guest doesn't grab the mouse, so the physical pointerup
  // reaches the document and this window-level (capture-phase) listener fires
  // at the true release time — even if the pointer left the overlay or the user
  // does nothing afterward.
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
      pushRecordedEvent({
        t: round3(recordingElapsedMs()),
        type: "mousewheel",
        button,
        x: c.x,
        y: c.y,
        nx: c.nx,
        ny: c.ny,
      });
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
  }, [toCoords, forward]);

  const handleStop = useCallback(async () => {
    // Flush a still-held press so a click made right before F10 keeps its
    // mouseup instead of ending the script on a lone mousedown.
    releaseActivePress();
    const result = await useRecordingStore.getState().stopAndSave();
    if (!result.success) {
      alert(`保存脚本失败: ${result.error}`);
    }
  }, [releaseActivePress]);

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
        // onPointerUp below. Safe because press injects a full click, so the
        // guest never contends for the mouse.
        try {
          e.currentTarget.setPointerCapture(e.pointerId);
        } catch {
          // no pointer-capture support; the window listener still catches it
        }
        handleMouseDown(e);
      }}
      onPointerUp={(e) => {
        // Fires at the real release time. Idempotent with the other release
        // paths — whichever runs first clears the tracked press; the rest no-op.
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
