// =====================================================================
// Guest-side "game area only" crop.
//
// A game page wraps the playable surface — a Flash <embed>/<object>, or a
// <canvas> for H5 titles — in a full web page, usually behind one or more
// nested iframes. This module locates that surface and makes it fill the
// webview, hiding everything around it.
//
// CSS-ONLY is a hard requirement. Reparenting an <embed>/<object> in Chromium
// destroys and recreates the plugin instance, which reloads the SWF and throws
// away the player's progress. Nothing here moves a node: every change is an
// inline style, plus one appended backdrop <div> per document.
//
// The surface and every iframe up its frame chain are pinned to their own
// viewport with `position: fixed`. Pinning an iframe makes the viewport of the
// document inside it full-size, so pinning every level composes: the innermost
// surface ends up filling the webview. It is all declarative CSS, so the order
// the levels are pinned in does not matter. Leftover page content is
// covered by a black backdrop per document rather than hidden node by node, so
// content with its own stacking context cannot poke through.
//
// The page is loaded normally and stays on its own origin, so flashVars,
// cookies and SWF domain checks are unaffected — that is the whole point of
// cropping instead of navigating straight to the inner game URL.
// =====================================================================
import { ipcRenderer } from "electron";

// Ignore embeds/canvases too small to be the game (tracking pixels, ad slots,
// decorative canvases).
const MIN_GAME_WIDTH = 200;
const MIN_GAME_HEIGHT = 150;

// Below the pinned surface, above everything the page can reasonably set.
const BACKDROP_Z = "2147483646";
const PINNED_Z = "2147483647";

const WATCH_INTERVAL_MS = 1500;
// Sub-pixel rounding slack when checking that a pin still spans its viewport.
const PIN_SLACK_PX = 2;

// Properties that make an ancestor a containing block for `position: fixed`,
// which would pin the surface to that ancestor instead of the viewport.
const CONTAINING_BLOCK_PROPS: Array<[string, string]> = [
  ["transform", "none"],
  ["filter", "none"],
  ["backdrop-filter", "none"],
  ["perspective", "none"],
  ["contain", "none"],
  ["will-change", "auto"],
];

interface CropReport {
  found: boolean;
  // Tag of the surface that was cropped to ("embed" | "object" | "canvas").
  tag?: string;
  // Resource URL of the surface — the SWF for Flash. Groundwork for the
  // "extract the playable URL" feature, which needs exactly this.
  src?: string;
  // URL of the document the surface lives in (the inner game frame).
  frameUrl?: string;
  width?: number;
  height?: number;
}

interface StyleSnapshot {
  el: HTMLElement;
  // Original inline style attribute, or null when the element had none.
  prev: string | null;
}

// What the host asked for.
interface CropCommand {
  on: boolean;
  // Wallpaper for the letterbox area, as a data URL. Null/absent = plain black.
  background?: string | null;
}

let active = false;
let watchTimer: ReturnType<typeof setInterval> | null = null;
let backgroundUrl: string | null = null;
// Elements pinned by the last apply(): the game surface plus each iframe up
// its frame chain. Empty when the last scan found no game. Watched so a frame
// swap — or the page overwriting our inline styles — triggers a re-crop.
const pinned: HTMLElement[] = [];
const touched: StyleSnapshot[] = [];
const backdrops: HTMLElement[] = [];

function report(payload: CropReport): void {
  try {
    ipcRenderer.sendToHost("fbox-crop-result", payload);
  } catch {
    // embedder gone (teardown); nothing to report to
  }
}

// Remember an element's inline style once, before the first override, so
// restore() puts back exactly what the page had.
function remember(el: HTMLElement): void {
  if (touched.some((t) => t.el === el)) return;
  touched.push({ el, prev: el.getAttribute("style") });
}

function force(el: HTMLElement, decls: Record<string, string>): void {
  remember(el);
  for (const prop in decls) {
    el.style.setProperty(prop, decls[prop], "important");
  }
}

// Stretch a container (an iframe in the frame chain) over its whole viewport.
function pinFill(el: HTMLElement): void {
  force(el, {
    position: "fixed",
    left: "0",
    top: "0",
    width: "100vw",
    height: "100vh",
    "max-width": "none",
    "max-height": "none",
    "min-width": "0",
    "min-height": "0",
    margin: "0",
    padding: "0",
    border: "0",
    "z-index": PINNED_Z,
    visibility: "visible",
    display: "block",
    opacity: "1",
  });
}

// Pin the game surface over its whole viewport, letterboxed to `aspect` so an
// H5 canvas is not distorted. Flash would letterbox its own stage anyway, but
// doing it here keeps both kinds consistent. All-zero insets plus
// `margin: auto` centers the box; the min() sizing re-fits on resize with no
// JS involved.
function pinFit(el: HTMLElement, aspect: number): void {
  const size =
    aspect > 0
      ? {
          width: `min(100vw, calc(100vh * ${aspect}))`,
          height: `min(100vh, calc(100vw / ${aspect}))`,
        }
      : { width: "100vw", height: "100vh" };

  force(el, {
    position: "fixed",
    left: "0",
    top: "0",
    right: "0",
    bottom: "0",
    margin: "auto",
    ...size,
    "max-width": "none",
    "max-height": "none",
    "min-width": "0",
    "min-height": "0",
    padding: "0",
    border: "0",
    "z-index": PINNED_Z,
    visibility: "visible",
    display: "block",
    opacity: "1",
  });
}

// Clear ancestor properties that would trap `position: fixed` in a local
// containing block. Only non-default values are overridden, to keep the number
// of mutated elements (and the restore list) small.
function neutralizeAncestors(el: HTMLElement): void {
  let node = el.parentElement;
  while (node) {
    const win = node.ownerDocument?.defaultView;
    if (win) {
      const computed = win.getComputedStyle(node);
      const overrides: Record<string, string> = {};
      for (const [prop, def] of CONTAINING_BLOCK_PROPS) {
        const value = computed.getPropertyValue(prop);
        if (value && value !== def) overrides[prop] = def;
      }
      if (Object.keys(overrides).length) force(node, overrides);
    }
    node = node.parentElement;
  }
}

// Only the backdrop in the game's own document is actually visible — the
// letterbox bars around the surface. The others sit behind a pinned iframe
// that covers them, and exist so no page pixel can show through anywhere.
function styleBackdrop(el: HTMLElement): void {
  el.style.cssText =
    "position:fixed!important;left:0!important;top:0!important;" +
    "right:0!important;bottom:0!important;background-color:#000!important;" +
    `z-index:${BACKDROP_Z}!important;pointer-events:none!important;`;
  if (!backgroundUrl) return;
  // A data: URL is base64, so it cannot contain the closing quote.
  el.style.setProperty(
    "background-image",
    `url("${backgroundUrl}")`,
    "important",
  );
  el.style.setProperty("background-size", "cover", "important");
  el.style.setProperty("background-position", "center", "important");
  el.style.setProperty("background-repeat", "no-repeat", "important");
}

// Kill the document's scrollbars and paint a backdrop over whatever page
// content is left behind the pinned surface.
function prepareDocument(doc: Document): void {
  if (doc.documentElement) {
    force(doc.documentElement, { overflow: "hidden", margin: "0" });
  }
  if (!doc.body) return;

  force(doc.body, { overflow: "hidden", margin: "0" });
  if (backdrops.some((b) => b.ownerDocument === doc)) return;

  const backdrop = doc.createElement("div");
  backdrop.setAttribute("data-fbox-crop-backdrop", "1");
  styleBackdrop(backdrop);
  doc.body.appendChild(backdrop);
  backdrops.push(backdrop);
}

interface Candidate {
  el: HTMLElement;
  win: Window;
  area: number;
  // Plugin surfaces outrank canvases: an ad iframe's canvas can be larger than
  // the game's own <embed>.
  isPlugin: boolean;
  aspect: number;
}

function collectCandidates(win: Window, out: Candidate[]): void {
  let doc: Document;
  try {
    doc = win.document; // throws if the frame is genuinely unreachable
  } catch {
    return;
  }

  doc.querySelectorAll<HTMLElement>("embed, object, canvas").forEach((el) => {
    const rect = el.getBoundingClientRect();
    if (rect.width < MIN_GAME_WIDTH || rect.height < MIN_GAME_HEIGHT) return;
    // A `display: none` element already has a zero rect, but one hidden via
    // visibility/opacity does not — and cropping to a deliberately hidden
    // preloaded embed would show a black screen.
    const computed = win.getComputedStyle(el);
    if (computed.visibility === "hidden" || computed.opacity === "0") return;
    out.push({
      el,
      win,
      area: rect.width * rect.height,
      isPlugin: el.tagName !== "CANVAS",
      aspect: rect.height > 0 ? rect.width / rect.height : 0,
    });
  });

  for (let i = 0; i < win.frames.length; i++) {
    try {
      collectCandidates(win.frames[i], out);
    } catch {
      // unreachable subframe; skip
    }
  }
}

function findGame(): Candidate | null {
  const candidates: Candidate[] = [];
  collectCandidates(window, candidates);
  if (!candidates.length) return null;
  candidates.sort((a, b) =>
    a.isPlugin !== b.isPlugin ? (a.isPlugin ? -1 : 1) : b.area - a.area,
  );
  return candidates[0];
}

function apply(): void {
  pinned.length = 0;
  const found = findGame();
  if (!found) {
    report({ found: false });
    return;
  }

  pinned.push(found.el);
  pinFit(found.el, found.aspect);
  neutralizeAncestors(found.el);
  if (found.el.ownerDocument) prepareDocument(found.el.ownerDocument);

  // Pin each iframe up the chain so every nested viewport is full-size.
  let win: Window = found.win;
  while (win !== window.top) {
    let frame: HTMLElement | null = null;
    try {
      frame = win.frameElement as HTMLElement | null;
    } catch {
      break; // unreachable parent; stop here
    }
    if (!frame) break;
    pinned.push(frame);
    pinFill(frame);
    neutralizeAncestors(frame);
    if (frame.ownerDocument) prepareDocument(frame.ownerDocument);
    try {
      win = win.parent;
    } catch {
      break;
    }
  }
  prepareDocument(document);

  const rect = found.el.getBoundingClientRect();
  report({
    found: true,
    tag: found.el.tagName.toLowerCase(),
    src:
      found.el.getAttribute("src") ||
      found.el.getAttribute("data") ||
      undefined,
    frameUrl: found.win.location?.href,
    width: Math.round(rect.width),
    height: Math.round(rect.height),
  });
}

function restore(): void {
  // remember() records each element once, before its first override, so every
  // snapshot here is the page's original inline style.
  for (const { el, prev } of touched) {
    if (prev === null) el.removeAttribute("style");
    else el.setAttribute("style", prev);
  }
  touched.length = 0;
  pinned.length = 0;
  backdrops.forEach((b) => b.remove());
  backdrops.length = 0;
}

function recrop(): void {
  restore();
  apply();
}

// Is this pin still doing its job? Checking the outcome rather than just the
// element's presence matters because a page can undo us without removing
// anything: writing to `el.style.width` replaces our value in the same inline
// declaration block, `!important` and all. Login flows are the common case —
// the page re-lays-out the game after sign-in and our pins evaporate.
function isPinIntact(el: HTMLElement): boolean {
  if (!el.isConnected) return false;
  const win = el.ownerDocument?.defaultView;
  if (!win) return false;
  if (win.getComputedStyle(el).position !== "fixed") return false;
  // A letterboxed surface spans only one axis of its viewport; a stretched
  // container spans both. Either way it must still span at least one.
  const rect = el.getBoundingClientRect();
  return (
    rect.width >= win.innerWidth - PIN_SLACK_PX ||
    rect.height >= win.innerHeight - PIN_SLACK_PX
  );
}

// Re-crop when the crop has stopped holding, or when the last scan found no
// game at all — that is the login-page case, where the game surface only
// appears minutes later, after the user signs in.
function watch(): void {
  if (!active) return;
  if (!pinned.length || !pinned.every(isPinIntact)) recrop();
}

ipcRenderer.on("fbox-crop", (_event, cmd: CropCommand) => {
  const on = !!cmd?.on;
  const nextBackground = cmd?.background ?? null;
  const backgroundChanged = nextBackground !== backgroundUrl;
  backgroundUrl = nextBackground;

  if (!on) {
    if (watchTimer) {
      clearInterval(watchTimer);
      watchTimer = null;
    }
    active = false;
    restore();
    return;
  }

  if (!active) {
    active = true;
    apply();
    if (!watchTimer) watchTimer = setInterval(watch, WATCH_INTERVAL_MS);
    return;
  }

  // Already cropping. A wallpaper change only needs a restyle. A repeated
  // enable is the host asking to check now rather than at the next tick (it
  // resends after an in-page navigation, which is how many login flows end) —
  // route it through watch() so an intact crop is left alone instead of
  // flickering through a restore/apply cycle.
  if (backgroundChanged) backdrops.forEach(styleBackdrop);
  else watch();
});
