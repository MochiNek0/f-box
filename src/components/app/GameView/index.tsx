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
import type {
  GameGeometry,
  GuestRecordReport,
} from "../../../types/electron";
import { ZoomIn, ZoomOut, RefreshCw, ArrowLeft, Monitor } from "lucide-react";
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
  const tab = tabs.find((t) => t.id === id);
  const zoomFactor = tab?.zoomFactor || 1;
  // Whether this tab is being recorded (input-capture overlay over the game).
  const isRecordingTab = useRecordingStore((s) => s.recordingTabId === id);

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
  }, [id, activeTabId, computeGeometry, renderWidth, renderHeight, zoomFactor, resolutionScale]);

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

    webview.addEventListener("dom-ready", onDomReady);
    webview.addEventListener("did-finish-load", onNavigation);
    webview.addEventListener("did-navigate", onNavigation);
    webview.addEventListener("did-navigate-in-page", onNavigation);
    webview.addEventListener("did-stop-loading", onNavigation);
    webview.addEventListener("render-process-gone", onCrashed);
    webview.addEventListener("plugin-crashed", onPluginCrashed);

    return () => {
      webview.removeEventListener("dom-ready", onDomReady);
      webview.removeEventListener("did-finish-load", onNavigation);
      webview.removeEventListener("did-navigate", onNavigation);
      webview.removeEventListener("did-navigate-in-page", onNavigation);
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
      {/* Toolbar */}
      <div className="h-gr-5 flex items-center justify-between px-gr-4 border-b border-white/5 absolute top-0 left-0 right-0 z-10 transition-all duration-500 hover:opacity-100 opacity-90 overflow-hidden">
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

        <div className="flex items-center gap-gr-1 bg-white/5 p-gr-1 border border-white/5 flex-shrink-0">
          <IconButton
            icon={<ZoomOut size={16} />}
            onClick={() => handleZoom(-0.1)}
            title="缩小"
          />
          <div className="w-12 text-center text-[10px] font-black text-foreground uppercase tracking-tighter">
            {Math.round(zoomFactor * 100)}%
          </div>
          <IconButton
            icon={<ZoomIn size={16} />}
            onClick={() => handleZoom(0.1)}
            title="放大"
          />
          <div className="w-px h-gr-3 bg-white/10 mx-gr-1" />
          <IconButton
            icon={<RefreshCw size={14} />}
            onClick={resetZoom}
            title="重置缩放"
          />
        </div>
      </div>

      {/* Webview Container */}
      <div className="flex-grow pt-10 overflow-hidden bg-black relative">
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
                // [DIAG] Block physical mouse input from reaching the game
                // during recording, so only the overlay's forwarded
                // sendInputEvent reaches it. Tests whether injection produces
                // Flash clicks.
                pointerEvents: isRecordingTab ? "none" : "auto",
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
          </div>
        </div>
      </div>
    </div>
  );
};
