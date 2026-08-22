import React, {
  useRef,
  useEffect,
  useState,
  useCallback,
  useLayoutEffect,
} from "react";
import { useTabStore } from "../../../store/useTabStore";
import {
  registerGameView,
  unregisterGameView,
} from "../../../store/gameViewRegistry";
import { useRecordingStore } from "../../../store/useRecordingStore";
import { RecordingOverlay } from "../RecordingOverlay";
import { usePointPickStore } from "../../../store/usePointPickStore";
import { usePlaybackStore } from "../../../store/usePlaybackStore";
import { useFullscreenStore } from "../../../store/useFullscreenStore";
import { PointPickOverlay } from "../PointPickOverlay";
import { SpeedControl } from "../SpeedControl";
import { AutomationSlotsBar } from "../AutomationSlotsBar";
import type {
  GameGeometry,
  GuestCropReport,
  GuestRecordReport,
} from "../../../types/electron";
import {
  ZoomIn,
  ZoomOut,
  RefreshCw,
  ArrowLeft,
  Monitor,
  Crop,
  Maximize,
  Minimize,
} from "lucide-react";
import { Button } from "../../common/Button";
import { IconButton } from "../../common/IconButton";
import {
  type GameResolutionMode,
  useSettingsStore,
} from "../../../store/useSettingsStore";

interface GameViewProps {
  id: string;
  url: string;
}

// The `ipc-message` event a <webview> raises for sendToHost calls.
type WebviewIpcMessageEvent = { channel: string; args?: unknown[] };

type FlashWebviewElement = HTMLElement & {
  setZoomFactor: (factor: number) => void;
  openDevTools: () => void;
  reload: () => void;
  getWebContentsId: () => number;
  send: (channel: string, ...args: any[]) => void;
  addEventListener(type: string, listener: (event: any) => void): void;
  removeEventListener(type: string, listener: (event: any) => void): void;
};

// Guest-side recording observer (echoes the mouse input the game actually
// receives back to the host during recording). The preload attribute must be
// present before the webview's first load.
const GUEST_RECORDER_PRELOAD_URL =
  window.electron?.automation?.guestRecorderPreloadUrl;

const WEBVIEW_FLASH_PROPS: Record<string, string> = {
  plugins: "true",
  allowpopups: "true",
  disablewebsecurity: "true",
  webpreferences: "plugins=yes",
};

const DEFAULT_GAME_WIDTH = 1280;
const MAX_GAME_WIDTH = 3840;
const MAX_RESOLUTION_SCALE = 2;
const MAX_WEBVIEW_ZOOM = 5;

// Upper bound on the webview backing-store size. renderWidth×renderHeight can
// otherwise reach ~7680×2160 (≈16.6M px, a ~66MB bitmap) on a wide HiDPI
// display, starving the Flash plugin process's memory and crashing it. Cap the
// area and let the resolution scale drop to fit.
const MAX_BACKING_PIXELS = 1920 * 1080 * 4;

// Auto-recover from a transient plugin crash by silently reloading once,
// before falling back to the manual crash screen. Bounded so a game that
// crashes on load can't reload forever.
const MAX_AUTO_RELOADS = 1;
const AUTO_RELOAD_BACKOFF_MS = 800;
// The game must stay alive this long after load before we consider it stable
// and re-arm the auto-reload budget for a future, unrelated crash.
const CRASH_STABLE_RESET_MS = 30000;

// Height of the invisible strip at the very top of the screen that reveals the
// toolbar in fullscreen. It only has to catch a cursor that has run into the
// screen edge, which lands it at y=0, so a few pixels is plenty — and that is
// all the game area it costs.
const FULLSCREEN_REVEAL_STRIP_PX = 4;

// Grace period before the revealed toolbar hides again, so a cursor that slips
// past its edge for a moment does not dismiss it mid-interaction.
const TOOLBAR_HIDE_DELAY_MS = 400;

// The wallpaper file is read once per path, not once per game view.
let backgroundCache: { path: string; dataUrl: string } | null = null;

/**
 * Clean resolution scale values that produce exact inverse fractions.
 * Using these avoids sub-pixel blurring from irrational scale factors
 * when the CSS `scale(1 / resolutionScale)` transform is applied.
 *
 * Each value N satisfies: `Math.round(width * N) / N ≈ width` with
 * minimal floating-point drift, so the render→display roundtrip stays
 * pixel-aligned.
 */
const CLEAN_RESOLUTION_SCALES = [1, 1.25, 1.5, 2] as const;

interface GameViewportMetrics {
  containerWidth: number;
  width: number;
  height: number;
  resolutionScale: number;
}

const getScreenCssWidth = () => {
  const screenWidth =
    window.screen?.availWidth || window.screen?.width || DEFAULT_GAME_WIDTH;
  return Math.max(DEFAULT_GAME_WIDTH, Math.floor(screenWidth));
};

/**
 * Snap the device pixel ratio to the nearest clean scale factor.
 * This ensures the webview is rendered at a resolution that can be
 * inverse-scaled back to CSS pixels without sub-pixel misalignment.
 */
const getAutoResolutionScale = (): number => {
  const dpr = window.devicePixelRatio || 1;
  const clamped = Math.max(1, Math.min(MAX_RESOLUTION_SCALE, dpr));

  let best = 1;
  let bestDist = Math.abs(clamped - 1);

  for (const s of CLEAN_RESOLUTION_SCALES) {
    const dist = Math.abs(clamped - s);
    if (dist < bestDist) {
      best = s;
      bestDist = dist;
    }
  }

  return best;
};

/**
 * Largest clean resolution scale (never below 1) whose backing store stays
 * within MAX_BACKING_PIXELS. Preserves the pixel-aligned clean fractions while
 * preventing the oversized-surface OOM that crashes the plugin.
 */
const getBudgetedResolutionScale = (width: number, height: number): number => {
  const auto = getAutoResolutionScale();
  let best = 1;
  for (const s of CLEAN_RESOLUTION_SCALES) {
    if (s <= auto && width * height * s * s <= MAX_BACKING_PIXELS) {
      best = s;
    }
  }
  return best;
};

const getGameViewportMetrics = (
  container: HTMLDivElement,
  mode: GameResolutionMode,
): GameViewportMetrics => {
  const containerWidth = Math.max(1, Math.floor(container.clientWidth));
  const height = Math.max(1, Math.floor(container.clientHeight));

  if (mode === "native") {
    return {
      containerWidth,
      width: DEFAULT_GAME_WIDTH,
      height,
      resolutionScale: 1,
    };
  }

  const screenLimitedWidth = Math.min(containerWidth, getScreenCssWidth());

  const width = Math.min(
    MAX_GAME_WIDTH,
    Math.max(DEFAULT_GAME_WIDTH, screenLimitedWidth),
  );

  return {
    containerWidth,
    width,
    height,
    resolutionScale: getBudgetedResolutionScale(width, height),
  };
};

export const GameView: React.FC<GameViewProps> = ({ id, url }) => {
  const { backToLibrary, updateZoom, tabs, activeTabId } = useTabStore();
  const gameResolutionMode = useSettingsStore(
    (state) => state.gameResolutionMode,
  );
  const cropEnabled = useSettingsStore((state) => !!state.gameCropEnabled[url]);
  const setGameCrop = useSettingsStore((state) => state.setGameCrop);
  const cropBackgroundPath = useSettingsStore(
    (state) => state.cropBackgroundPath,
  );
  const isFullscreen = useFullscreenStore((s) => s.isFullscreen);
  const chromeRevealed = useFullscreenStore((s) => s.chromeRevealed);
  const setChromeRevealed = useFullscreenStore((s) => s.setChromeRevealed);
  const tab = tabs.find((t) => t.id === id);
  const zoomFactor = tab?.zoomFactor || 1;
  // Whether this tab is being recorded (input-capture overlay over the game).
  const isRecordingTab = useRecordingStore((s) => s.recordingTabId === id);
  // Whether ClickerTab is waiting for a mouse-position pick on this tab.
  const isPickingTab = usePointPickStore((s) => s.pending?.tabId === id);
  // Cropping moves the game within the guest surface, so toggling it mid-run
  // would corrupt the script being recorded or misaim the one being played.
  const isPlaying = usePlaybackStore((s) => s.isPlaying);

  const gameAreaRef = useRef<HTMLDivElement | null>(null);
  const webviewRef = useRef<FlashWebviewElement | null>(null);
  const webContentsIdRef = useRef<number | null>(null); // guest id for playback injection
  const latestZoomRef = useRef(zoomFactor);
  const latestResolutionScaleRef = useRef(1);
  const [pid, setPid] = useState<number | null>(null);
  const [isCrashed, setIsCrashed] = useState(false);
  const [isRecovering, setIsRecovering] = useState(false);
  const [crashReason, setCrashReason] = useState<string | null>(null);
  const crashReloadAttemptsRef = useRef(0);
  const autoReloadTimerRef = useRef<number | null>(null);
  const stableTimerRef = useRef<number | null>(null);
  // "Game area only" crop, applied inside the guest by guest-crop.cts.
  // "notfound" means the guest scanned but saw no playable surface, so the
  // full page is still showing — worth telling the user rather than leaving
  // the toggle looking active.
  const [cropStatus, setCropStatus] = useState<"off" | "on" | "notfound">(
    "off",
  );
  // Read by computeGeometry and by the dom-ready handler, both of which run
  // outside the render that knows the current values.
  const cropAppliedRef = useRef(false);
  const cropEnabledRef = useRef(cropEnabled);
  // Wallpaper as a data URL, resolved from the persisted path.
  const cropBackgroundRef = useRef<string | null>(null);
  const toolbarRef = useRef<HTMLDivElement | null>(null);
  const hideToolbarTimerRef = useRef<number | null>(null);
  const [gameViewport, setGameViewport] = useState<GameViewportMetrics>({
    containerWidth: DEFAULT_GAME_WIDTH,
    width: DEFAULT_GAME_WIDTH,
    height: 720,
    resolutionScale: 1,
  });

  // Since resolutionScale is snapped to a clean fraction (1, 1.25, 1.5, 2),
  // the inverse scale `1 / resolutionScale` is also exact, preventing
  // sub-pixel misalignment that causes blurry Flash rendering.
  const resolutionScale = gameViewport.resolutionScale;
  const renderWidth = Math.max(
    1,
    Math.round(gameViewport.width * resolutionScale),
  );
  const renderHeight = Math.max(
    1,
    Math.round(gameViewport.height * resolutionScale),
  );
  const inverseScale = 1 / resolutionScale;
  // For display in toolbar
  const actualResolutionScale = resolutionScale;

  // Keep the latest guest surface size available to the imperative geometry
  // getter (used by background-playback record/play).
  const renderSizeRef = useRef({ w: renderWidth, h: renderHeight });
  useEffect(() => {
    renderSizeRef.current = { w: renderWidth, h: renderHeight };
  }, [renderWidth, renderHeight]);

  // Compute a fresh GameGeometry snapshot: guest surface size + on-screen
  // physical-pixel rect of the displayed game. Screen rect lets record-time
  // screen-absolute coords be normalized; renderWidth/Height map them back to
  // guest coords at play time. Returns null until the guest is ready.
  const computeGeometry = useCallback((): GameGeometry | null => {
    const el = webviewRef.current;
    const id = webContentsIdRef.current;
    if (!el || id == null) return null;
    const rect = el.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    return {
      webContentsId: id,
      renderWidth: renderSizeRef.current.w,
      renderHeight: renderSizeRef.current.h,
      zoomFactor: latestZoomRef.current,
      resolutionScale: latestResolutionScaleRef.current,
      devicePixelRatio: dpr,
      screenX: (window.screenX + rect.left) * dpr,
      screenY: (window.screenY + rect.top) * dpr,
      screenW: rect.width * dpr,
      screenH: rect.height * dpr,
      cropped: cropAppliedRef.current,
    };
  }, []);

  useEffect(() => {
    registerGameView(id, computeGeometry);
    return () => unregisterGameView(id);
  }, [id, computeGeometry]);

  // Guest recording echo: while this tab records, enable the guest-side
  // observer (guest-record-preload) and pipe its reports to the overlay's
  // handler. The overlay registers/unregisters itself via the prop below.
  const guestReportHandlerRef = useRef<((r: GuestRecordReport) => void) | null>(
    null,
  );
  const registerGuestReportHandler = useCallback(
    (cb: (r: GuestRecordReport) => void) => {
      guestReportHandlerRef.current = cb;
      return () => {
        guestReportHandlerRef.current = null;
      };
    },
    [],
  );
  useEffect(() => {
    const webview = webviewRef.current;
    if (!webview || !isRecordingTab) return;
    const onIpcMessage = (e: any) => {
      if (e.channel === "fbox-record-input") {
        guestReportHandlerRef.current?.(e.args?.[0]);
      } else if (e.channel === "fbox-record-ack") {
        console.log("[REC] guest recorder attached");
      }
    };
    webview.addEventListener("ipc-message", onIpcMessage);
    try {
      webview.send("fbox-record", true);
    } catch (err) {
      console.warn("[REC] failed to enable guest recorder:", err);
    }
    return () => {
      webview.removeEventListener("ipc-message", onIpcMessage);
      try {
        webview.send("fbox-record", false);
      } catch {
        // guest gone; nothing to disable
      }
    };
  }, [isRecordingTab]);

  // Push the crop state to the guest. Before the first dom-ready the preload
  // is not listening yet, so onDomReady re-sends it.
  const sendCrop = useCallback((on: boolean) => {
    if (webContentsIdRef.current == null) return;
    try {
      webviewRef.current?.send("fbox-crop", {
        on,
        background: cropBackgroundRef.current,
      });
    } catch (err) {
      console.warn("[CROP] failed to send crop state:", err);
    }
  }, []);

  // Resolve the wallpaper to a data URL and push it to the guest. A file:// URL
  // would be simpler, but loading one as a subresource of an http game page is
  // unreliable, and a silently missing background is hard to debug.
  useEffect(() => {
    let cancelled = false;

    const push = (dataUrl: string | null) => {
      if (cancelled) return;
      cropBackgroundRef.current = dataUrl;
      if (cropEnabledRef.current) sendCrop(true);
    };

    if (!cropBackgroundPath) {
      push(null);
      return;
    }
    if (backgroundCache?.path === cropBackgroundPath) {
      push(backgroundCache.dataUrl);
      return;
    }

    void window.electron
      .readBackgroundImage(cropBackgroundPath)
      .then((res) => {
        if (res.success && res.dataUrl) {
          backgroundCache = {
            path: cropBackgroundPath,
            dataUrl: res.dataUrl,
          };
          push(res.dataUrl);
        } else {
          console.warn("[CROP] background image unavailable:", res.error);
          push(null);
        }
      })
      .catch((err) => {
        console.warn("[CROP] failed to read background image:", err);
        push(null);
      });

    return () => {
      cancelled = true;
    };
  }, [cropBackgroundPath, sendCrop]);

  // The guest reports the outcome of every crop attempt, including the
  // periodic re-crop that follows a game frame swap.
  useEffect(() => {
    const webview = webviewRef.current;
    if (!webview) return;
    const onIpcMessage = (e: WebviewIpcMessageEvent) => {
      if (e.channel !== "fbox-crop-result") return;
      const report = e.args?.[0] as GuestCropReport | undefined;
      const applied = !!report?.found;
      cropAppliedRef.current = applied;
      setCropStatus(applied ? "on" : "notfound");
      if (applied) {
        console.log(
          `[CROP] <${report?.tag}> ${report?.width}x${report?.height}`,
          report?.src,
        );
      }
    };
    webview.addEventListener("ipc-message", onIpcMessage);
    return () => webview.removeEventListener("ipc-message", onIpcMessage);
  }, []);

  // Kept for the dom-ready handler, which re-applies the crop on a fresh
  // document and cannot see the current render's value.
  useEffect(() => {
    cropEnabledRef.current = cropEnabled;
  }, [cropEnabled]);

  const toggleCrop = useCallback(() => {
    const next = !cropEnabled;
    setGameCrop(url, next);
    cropEnabledRef.current = next;
    // Turning it off is immediate and cannot fail; turning it on is confirmed
    // by the guest's report, which flips the status then.
    if (!next) {
      cropAppliedRef.current = false;
      setCropStatus("off");
    }
    sendCrop(next);
  }, [cropEnabled, setGameCrop, url, sendCrop]);

  // When main starts playback into this tab's guest, focus the <webview>
  // element so injected mouse clicks reach PPAPI Flash. A main-side
  // WebContents.focus() alone does not establish that input focus.
  useEffect(() => {
    const detach = window.electron.automation.onFocusGuest((webContentsId) => {
      if (webContentsIdRef.current === webContentsId) {
        webviewRef.current?.focus();
      }
    });
    return detach;
  }, []);

  // Push the active game's target (webContentsId + geometry) to main so the
  // F3/F4/F5 hotkey playback path (which has no renderer call) can target it.
  useEffect(() => {
    if (id !== activeTabId) return;
    const geometry = computeGeometry();
    if (geometry) {
      window.electron.automation.setActiveTarget({ geometry });
    }
  }, [
    id,
    activeTabId,
    computeGeometry,
    renderWidth,
    renderHeight,
    zoomFactor,
    resolutionScale,
    cropStatus,
  ]);

  const applyZoom = useCallback(() => {
    if (!webviewRef.current) {
      return;
    }

    try {
      const effectiveZoom = Math.min(
        MAX_WEBVIEW_ZOOM,
        latestZoomRef.current * latestResolutionScaleRef.current,
      );
      webviewRef.current.setZoomFactor(effectiveZoom);
    } catch (e) {
      console.warn("Failed to set zoom factor:", e);
    }
  }, []);

  // Debounce zoom-button changes: rapid clicks each force the Flash plugin to
  // re-rasterize, and each re-raster shows a brief gray flash. Update the ref
  // immediately (so geometry stays correct) but coalesce the actual
  // setZoomFactor call so it only fires once after the clicks settle.
  useEffect(() => {
    latestZoomRef.current = zoomFactor;
    const timer = window.setTimeout(applyZoom, 120);
    return () => window.clearTimeout(timer);
  }, [zoomFactor, applyZoom]);

  useEffect(() => {
    latestResolutionScaleRef.current = actualResolutionScale;
    applyZoom();
  }, [actualResolutionScale, applyZoom]);

  useLayoutEffect(() => {
    const container = gameAreaRef.current;
    if (!container) {
      return;
    }

    const mode = gameResolutionMode || "auto";

    const measure = () => {
      const next = getGameViewportMetrics(container, mode);
      setGameViewport((current) =>
        current.containerWidth === next.containerWidth &&
        current.width === next.width &&
        current.height === next.height &&
        current.resolutionScale === next.resolutionScale
          ? current
          : next,
      );
    };

    // useLayoutEffect runs after layout, so clientWidth/clientHeight are
    // already accurate here — no need to defer to a later frame.
    measure();

    const observer = new ResizeObserver(measure);
    observer.observe(container);

    return () => {
      observer.disconnect();
    };
  }, [gameResolutionMode]);

  useEffect(() => {
    if (!webviewRef.current) {
      return;
    }

    const webview = webviewRef.current;

    const onDomReady = async () => {
      setIsCrashed(false);
      setIsRecovering(false);
      setCrashReason(null);
      applyZoom();
      // Capture the guest webContents id for sendInputEvent-based playback.
      try {
        webContentsIdRef.current = webviewRef.current?.getWebContentsId() ?? null;
      } catch {
        webContentsIdRef.current = null;
      }
      // A fresh document starts uncropped (the preload's state resets with it),
      // so re-apply the crop if this game wants it.
      // cropStatus must stay in lockstep with cropAppliedRef — the
      // setActiveTarget effect keys off it to re-push geometry — so leave it
      // "off" and let the guest's report flip it.
      cropAppliedRef.current = false;
      setCropStatus("off");
      sendCrop(cropEnabledRef.current);
      // Now that the guest id exists, push the active target for hotkey play.
      if (id === activeTabId) {
        const geometry = computeGeometry();
        if (geometry) {
          window.electron.automation.setActiveTarget({ geometry });
        }
      }
      // A fresh dom-ready means the Flash plugin process may have respawned
      // (reload/navigation). Tell the speed manager so it can re-inject into
      // the new process immediately instead of waiting for its poll.
      window.electron.speed?.notifyFlashChanged?.();
      // Re-arm the auto-reload budget only once the game has stayed alive a
      // while — resetting immediately would let a crash-on-load game reload
      // forever.
      if (stableTimerRef.current) window.clearTimeout(stableTimerRef.current);
      stableTimerRef.current = window.setTimeout(() => {
        stableTimerRef.current = null;
        crashReloadAttemptsRef.current = 0;
      }, CRASH_STABLE_RESET_MS);
      try {
        // Get the actual Flash plugin process PID instead of the webview PID
        const osPid = await window.electron.getFlashPid();
        setPid(osPid);
      } catch (e) {
        console.warn("Failed to get Flash PID:", e);
      }
    };

    const recover = (reason: string) => {
      // A crash means we weren't stable — cancel any pending "re-arm" timer.
      if (stableTimerRef.current) {
        window.clearTimeout(stableTimerRef.current);
        stableTimerRef.current = null;
      }
      window.electron.speed?.notifyFlashChanged?.();
      setCrashReason(reason);

      if (crashReloadAttemptsRef.current < MAX_AUTO_RELOADS) {
        // Silently reload after a short backoff instead of alarming the user.
        crashReloadAttemptsRef.current += 1;
        setIsCrashed(false);
        setIsRecovering(true);
        const delay = AUTO_RELOAD_BACKOFF_MS * crashReloadAttemptsRef.current;
        if (autoReloadTimerRef.current) {
          window.clearTimeout(autoReloadTimerRef.current);
        }
        autoReloadTimerRef.current = window.setTimeout(() => {
          autoReloadTimerRef.current = null;
          try {
            webviewRef.current?.reload();
          } catch (err) {
            console.warn("Auto-reload failed:", err);
            setIsRecovering(false);
            setIsCrashed(true);
          }
        }, delay);
      } else {
        // Auto-recovery exhausted — show the crash screen for manual reload.
        setIsRecovering(false);
        setIsCrashed(true);
      }
    };

    const onCrashed = (e: any) => {
      console.error("Webview crashed:", e);
      recover(e.reason || "unknown");
    };

    const onPluginCrashed = (e: any) => {
      console.error("Flash plugin crashed:", e);
      recover("plugin-crashed");
    };

    const onNavigation = () => {
      // Electron 11 webview may reset zoom on navigation.
      applyZoom();
    };

    // Same-document navigation, which is how many login flows finish. The page
    // has likely rebuilt the game frame, so nudge the guest to check its crop
    // now instead of waiting for its next poll. A crop that still holds is
    // left untouched.
    const onInPageNavigation = () => {
      if (cropEnabledRef.current) sendCrop(true);
    };

    webview.addEventListener("dom-ready", onDomReady);
    webview.addEventListener("did-finish-load", onNavigation);
    webview.addEventListener("did-navigate", onNavigation);
    webview.addEventListener("did-navigate-in-page", onNavigation);
    webview.addEventListener("did-navigate-in-page", onInPageNavigation);
    webview.addEventListener("did-stop-loading", onNavigation);
    webview.addEventListener("render-process-gone", onCrashed);
    webview.addEventListener("plugin-crashed", onPluginCrashed);

    return () => {
      webview.removeEventListener("dom-ready", onDomReady);
      webview.removeEventListener("did-finish-load", onNavigation);
      webview.removeEventListener("did-navigate", onNavigation);
      webview.removeEventListener("did-navigate-in-page", onNavigation);
      webview.removeEventListener("did-navigate-in-page", onInPageNavigation);
      webview.removeEventListener("did-stop-loading", onNavigation);
      webview.removeEventListener("render-process-gone", onCrashed);
      webview.removeEventListener("plugin-crashed", onPluginCrashed);
      if (autoReloadTimerRef.current) {
        window.clearTimeout(autoReloadTimerRef.current);
        autoReloadTimerRef.current = null;
      }
      if (stableTimerRef.current) {
        window.clearTimeout(stableTimerRef.current);
        stableTimerRef.current = null;
      }
    };
  }, [id, url, applyZoom]);

  const handleZoom = (delta: number) => {
    const newZoom = Math.max(0.2, Math.min(3, zoomFactor + delta));
    updateZoom(id, newZoom);
  };

  const resetZoom = () => updateZoom(id, 1);

  // While cropped, the game is sized in viewport units inside the guest, so it
  // fills the surface at any zoom — the buttons would do nothing visible.
  const zoomLocked = cropStatus === "on";
  // In fullscreen the toolbar is hidden until the cursor reaches the top edge.
  const toolbarVisible = !isFullscreen || chromeRevealed;
  // The extra fullscreen tools are only mounted for the visible tab: every tab
  // keeps its GameView alive, and AutomationSlotsBar loads script lists and
  // subscribes to status on mount.
  const showFullscreenTools = isFullscreen && id === activeTabId;

  const cancelToolbarHide = useCallback(() => {
    if (hideToolbarTimerRef.current) {
      window.clearTimeout(hideToolbarTimerRef.current);
      hideToolbarTimerRef.current = null;
    }
  }, []);

  const scheduleToolbarHide = useCallback(() => {
    if (!isFullscreen) return;
    cancelToolbarHide();
    hideToolbarTimerRef.current = window.setTimeout(() => {
      hideToolbarTimerRef.current = null;
      // A native <select> popup (speed preset, script slot) is an OS window, so
      // opening one fires mouseleave on the toolbar. Don't pull the toolbar out
      // from under it — the focusout when the popup closes re-arms this.
      if (toolbarRef.current?.contains(document.activeElement)) return;
      setChromeRevealed(false);
    }, TOOLBAR_HIDE_DELAY_MS);
  }, [isFullscreen, cancelToolbarHide, setChromeRevealed]);

  useEffect(() => cancelToolbarHide, [cancelToolbarHide]);

  const handleReload = () => {
    if (webviewRef.current) {
      // Manual reload — give auto-recovery a fresh budget for future crashes.
      crashReloadAttemptsRef.current = 0;
      setIsCrashed(false);
      setIsRecovering(false);
      setCrashReason(null);
      webviewRef.current.reload();
    }
  };

  return (
    <div className="flex flex-col h-full bg-zinc-950 overflow-hidden relative">
      {/* Fullscreen edge trigger: the cursor cannot go past the top of the
          screen, so it reliably lands in this strip when flicked upward — and
          unlike a host-side hover zone over the game, it does not need the
          guest to report mouse movement. Suppressed while recording so it
          cannot swallow a click meant for the recording overlay. */}
      {isFullscreen && !chromeRevealed && !isRecordingTab && (
        <div
          className="absolute top-0 left-0 right-0 z-30"
          style={{ height: `${FULLSCREEN_REVEAL_STRIP_PX}px` }}
          onMouseEnter={() => setChromeRevealed(true)}
        />
      )}

      {/* Toolbar. In fullscreen it floats over the game rather than sitting
          above it, so it gets its own background to stay readable, and hides
          again as soon as the cursor leaves it. */}
      {toolbarVisible && (
        <div
          ref={toolbarRef}
          className={`flex items-center justify-between px-gr-4 border-b border-white/5 absolute top-0 left-0 right-0 z-10 transition-all duration-500 hover:opacity-100 opacity-90 overflow-hidden h-10 ${
            isFullscreen ? "bg-zinc-950/80 backdrop-blur-sm" : ""
          }`}
          onMouseEnter={cancelToolbarHide}
          onMouseLeave={scheduleToolbarHide}
          onBlur={scheduleToolbarHide}
        >
          <div className="flex items-center gap-gr-4 flex-shrink">
            <IconButton
              icon={<ArrowLeft size={16} />}
              onClick={() => backToLibrary(id)}
              title="返回库"
              className="flex items-center gap-gr-2"
            />
            <div className="h-gr-3 w-px bg-white/10 hidden md:block" />
            <div className="text-[10px] font-black text-zinc-500 truncate max-w-[150px] md:max-w-[300px] hidden sm:block uppercase tracking-widest">
              {url}
            </div>
            {pid && (
              <>
                <div className="h-gr-3 w-px bg-white/10 hidden md:block" />
                <div
                  className="text-[10px] text-primary font-black hidden sm:flex items-center gap-gr-2 cursor-help uppercase tracking-tighter"
                  title="Flash Plugin Process ID (在 CE 中附加此进程以进行变速)"
                >
                  <span className="w-2 h-2 rounded-full bg-primary animate-pulse shadow-[0_0_8px_rgba(var(--primary),0.5)]" />
                  CE PID: {pid}
                </div>
              </>
            )}
            <div
              className="h-6 items-center gap-gr-2 text-[10px] font-black text-zinc-500 hidden lg:flex uppercase tracking-tighter"
              title={`游戏画面渲染: ${renderWidth} x ${renderHeight}`}
            >
              <Monitor size={12} />
              {gameResolutionMode === "auto"
                ? `${Math.round(actualResolutionScale * 100)}%`
                : `${DEFAULT_GAME_WIDTH}px`}
            </div>
          </div>

          {/* Fullscreen-only tools. In windowed mode these live in the title
              bar and tab bar, both of which are gone in fullscreen — this is
              the only place left to reach them without exiting first. */}
          {showFullscreenTools && (
            <div className="flex min-w-0 items-center gap-gr-2 overflow-x-auto no-scrollbar">
              <SpeedControl showHint={false} />
              <div className="h-gr-3 w-px flex-shrink-0 bg-white/10" />
              <AutomationSlotsBar />
            </div>
          )}

          <div className="flex items-center gap-gr-1 bg-white/5 p-gr-1 border border-white/5 flex-shrink-0">
            <IconButton
              icon={<Crop size={14} />}
              onClick={toggleCrop}
              disabled={isRecordingTab || isPlaying}
              title={
                isRecordingTab || isPlaying
                  ? "仅游戏区域：录制或播放期间不可切换"
                  : cropStatus === "notfound"
                    ? "仅游戏区域：未找到游戏画面，仍在显示完整网页"
                    : cropEnabled
                      ? "仅游戏区域：已开启（点击显示完整网页）"
                      : "仅游戏区域：只显示游戏画面，隐藏网页其余部分"
              }
              className={
                cropStatus === "notfound"
                  ? "text-amber-400 hover:text-amber-300"
                  : cropEnabled
                    ? "text-primary bg-primary/10"
                    : ""
              }
            />
            <div className="w-px h-gr-3 bg-white/10 mx-gr-1" />
            <IconButton
              icon={
                isFullscreen ? <Minimize size={14} /> : <Maximize size={14} />
              }
              onClick={() => window.electron.toggleFullscreen()}
              title={isFullscreen ? "退出全屏 (F11)" : "全屏 (F11)"}
              className={isFullscreen ? "text-primary bg-primary/10" : ""}
            />
            <div className="w-px h-gr-3 bg-white/10 mx-gr-1" />
            <IconButton
              icon={<ZoomOut size={16} />}
              onClick={() => handleZoom(-0.1)}
              disabled={zoomLocked}
              title={zoomLocked ? "裁剪模式下画面自适应，无需缩放" : "缩小"}
            />
            <div
              className={`w-12 text-center text-[10px] font-black uppercase tracking-tighter ${
                zoomLocked ? "text-zinc-600" : "text-foreground"
              }`}
            >
              {zoomLocked ? "自适应" : `${Math.round(zoomFactor * 100)}%`}
            </div>
            <IconButton
              icon={<ZoomIn size={16} />}
              onClick={() => handleZoom(0.1)}
              disabled={zoomLocked}
              title={zoomLocked ? "裁剪模式下画面自适应，无需缩放" : "放大"}
            />
            <div className="w-px h-gr-3 bg-white/10 mx-gr-1" />
            <IconButton
              icon={<RefreshCw size={14} />}
              onClick={resetZoom}
              disabled={zoomLocked}
              title={zoomLocked ? "裁剪模式下画面自适应，无需缩放" : "重置缩放"}
            />
          </div>
        </div>
      )}

      {/* Webview Container. The 40px of headroom matches the toolbar's height
          exactly, so no black strip shows between the two — in fullscreen the
          toolbar floats instead, so the game gets the whole screen. */}
      <div
        className={`flex-grow overflow-hidden bg-black relative ${
          isFullscreen ? "" : "pt-10"
        }`}
      >
        {isRecovering && (
          <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-zinc-900/85 backdrop-blur-sm text-white p-gr-6 text-center">
            <div className="w-14 h-14 bg-primary/15 rounded-full flex items-center justify-center mb-gr-4 border border-primary/30">
              <RefreshCw size={28} className="text-primary animate-spin" />
            </div>
            <h3 className="text-lg font-black uppercase tracking-widest mb-gr-2">
              正在自动恢复游戏…
            </h3>
            <p className="text-zinc-400 text-sm max-w-md">
              游戏出现异常，正在自动重新加载。
            </p>
          </div>
        )}
        {isCrashed && (
          <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-zinc-900/90 backdrop-blur-sm text-white p-gr-6 text-center">
            <div className="w-16 h-16 bg-red-500/20 rounded-full flex items-center justify-center mb-gr-4 border border-red-500/30">
              <RefreshCw size={32} className="text-red-500" />
            </div>
            <h3 className="text-xl font-black uppercase tracking-widest mb-gr-2">游戏已崩溃</h3>
            <p className="text-zinc-400 text-sm mb-gr-6 max-w-md">
              由于渲染进程或插件异常，游戏视图已停止响应 ({crashReason})。这通常是由于内存不足或变速器冲突引起的。
            </p>
            <Button
              onClick={handleReload}
              size="lg"
              className="px-gr-6 text-black hover:scale-105 shadow-[0_0_20px_rgba(var(--primary),0.3)]"
            >
              重新加载游戏
            </Button>
          </div>
        )}
        <div
          ref={gameAreaRef}
          className="w-full h-full overflow-x-hidden overflow-y-auto flex items-start justify-center"
        >
          <div
            className="relative h-full flex-shrink-0 overflow-hidden bg-black shadow-2xl"
            style={{ width: `${gameViewport.width}px` }}
          >
            <webview
              ref={webviewRef}
              preload={GUEST_RECORDER_PRELOAD_URL}
              src={url}
              {...WEBVIEW_FLASH_PROPS} // Enable Flash & Popups
              className={`absolute left-0 top-0 bg-black transition-opacity duration-300 ${isCrashed ? 'opacity-0' : 'opacity-100'}`}
              style={{
                width: `${renderWidth}px`,
                height: `${renderHeight}px`,
                transform: `scale(${inverseScale})`,
                transformOrigin: "top left",
                imageRendering: "auto",
                // Block physical mouse input from reaching the game while the
                // overlay is up, so the game only ever sees the overlay's
                // forwarded sendInputEvent — otherwise every click would land
                // twice, once physically and once injected.
                pointerEvents: isRecordingTab || isPickingTab ? "none" : "auto",
              }}
            />
            {/* Recording input-capture overlay: above the webview (z-10),
                below the crash/recovery masks (z-20). focusGuest keeps
                keyboard focus on the webview so physical keys reach the
                game while the overlay captures the mouse. */}
            {isRecordingTab && (
              <RecordingOverlay
                focusGuest={() => webviewRef.current?.focus()}
                registerGuestReportHandler={registerGuestReportHandler}
              />
            )}
            {isPickingTab && <PointPickOverlay />}
          </div>
        </div>
      </div>
    </div>
  );
};
