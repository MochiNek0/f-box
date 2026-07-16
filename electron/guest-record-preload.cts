// =====================================================================
// Guest-side recording observer, attached to the game <webview> as its
// preload script.
//
// The overlay used to be the only observer of mouse input during recording,
// which forced live feedback to be injected as a complete click: a genuinely
// HELD mouseDown makes PPAPI Flash grab mouse capture, after which the
// physical release is routed to the guest and the overlay can never see it.
// Observing from INSIDE the guest removes that limitation: whatever input the
// game actually receives — injected (forwarded by the overlay) or physical
// (routed here by capture) — is echoed to the embedder over sendToHost, and
// the recording session stores exactly that stream. Recording and playback
// are unified by construction: playback re-injects the events the game
// demonstrably received while recording (long-press and drag included).
//
// Listeners are attached to the top document and every reachable iframe
// document (the game webview runs with websecurity disabled, so "cross-origin"
// frames are walkable too); coordinates are offset to the top viewport. If a
// game frame is still unreachable no echo arrives for it and the overlay
// falls back to the legacy click-injection recording after a short probe.
//
// Keyboard is deliberately NOT echoed here — physical keys already reach the
// focused guest and are mirrored for recording by main's before-input-event
// handler (automation-manager.cts).
// =====================================================================
import { ipcRenderer } from "electron";

interface EchoPayload {
  kind: "mousedown" | "mouseup" | "mousemove" | "mousewheel";
  button: number;
  // Top-viewport CSS px plus the top viewport size, so the host can
  // normalize zoom-independently (cx/iw === injected-x/renderWidth).
  cx: number;
  cy: number;
  iw: number;
  ih: number;
  deltaY?: number;
}

let active = false;
let walkTimer: ReturnType<typeof setInterval> | null = null;
const attachedDocs = new WeakSet<Document>();

function echo(payload: EchoPayload): void {
  try {
    ipcRenderer.sendToHost("fbox-record-input", payload);
  } catch {
    // embedder gone (teardown); nothing to report to
  }
}

// CSS-px offset of `win`'s viewport inside the top viewport, accumulated up
// the frame chain. Frames whose parent is unreachable were skipped at attach
// time, so the walk here never throws.
function frameOffset(win: Window): { x: number; y: number } {
  let x = 0;
  let y = 0;
  let w: Window = win;
  while (w !== window.top && w.frameElement) {
    const fe = w.frameElement as HTMLElement;
    const rect = fe.getBoundingClientRect();
    x += rect.left + fe.clientLeft;
    y += rect.top + fe.clientTop;
    w = w.parent;
  }
  return { x, y };
}

function buildPayload(
  win: Window,
  kind: EchoPayload["kind"],
  e: MouseEvent,
): EchoPayload {
  const off = frameOffset(win);
  return {
    kind,
    button: e.button,
    cx: e.clientX + off.x,
    cy: e.clientY + off.y,
    iw: window.innerWidth || 1,
    ih: window.innerHeight || 1,
  };
}

function attachTo(win: Window): void {
  let doc: Document;
  try {
    doc = win.document; // throws if the frame is genuinely unreachable
  } catch {
    return;
  }
  if (!attachedDocs.has(doc)) {
    attachedDocs.add(doc);
    const mouse = (kind: EchoPayload["kind"]) => (e: MouseEvent) => {
      if (active) echo(buildPayload(win, kind, e));
    };
    doc.addEventListener("mousedown", mouse("mousedown"), true);
    doc.addEventListener("mouseup", mouse("mouseup"), true);
    doc.addEventListener("mousemove", mouse("mousemove"), true);
    doc.addEventListener(
      "wheel",
      (e: WheelEvent) => {
        if (!active) return;
        const payload = buildPayload(win, "mousewheel", e);
        payload.deltaY = e.deltaY;
        echo(payload);
      },
      { capture: true, passive: true },
    );
  }
  for (let i = 0; i < win.frames.length; i++) {
    try {
      attachTo(win.frames[i]);
    } catch {
      // unreachable subframe; skip
    }
  }
}

ipcRenderer.on("fbox-record", (_event, on: boolean) => {
  active = !!on;
  if (active) {
    // (Re-)walk the frame tree so iframes added since load get listeners; the
    // slow re-walk catches frames the game creates mid-recording.
    attachTo(window);
    if (!walkTimer) walkTimer = setInterval(() => attachTo(window), 2000);
    ipcRenderer.sendToHost("fbox-record-ack");
  } else if (walkTimer) {
    clearInterval(walkTimer);
    walkTimer = null;
  }
});
