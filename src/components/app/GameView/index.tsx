import React, {
  useRef,
  useEffect,
  useState,
  useCallback,
  useLayoutEffect,
} from "react";
import { useTabStore } from "../../../store/useTabStore";
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
  addEventListener(type: string, listener: (event: any) => void): void;
  removeEventListener(type: string, listener: (event: any) => void): void;
};

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

const getAutoResolutionScale = () => {
  const dpr = window.devicePixelRatio || 1;
  return Math.max(1, Math.min(MAX_RESOLUTION_SCALE, dpr));
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

  return {
    containerWidth,
    width: Math.min(
      MAX_GAME_WIDTH,
      Math.max(DEFAULT_GAME_WIDTH, screenLimitedWidth),
    ),
    height,
    resolutionScale: getAutoResolutionScale(),
  };
};

export const GameView: React.FC<GameViewProps> = ({ id, url }) => {
  const { backToLibrary, updateZoom, tabs } = useTabStore();
  const gameResolutionMode = useSettingsStore(
    (state) => state.gameResolutionMode,
  );
  const tab = tabs.find((t) => t.id === id);
  const zoomFactor = tab?.zoomFactor || 1;

  const gameAreaRef = useRef<HTMLDivElement | null>(null);
  const webviewRef = useRef<FlashWebviewElement | null>(null);
  const latestZoomRef = useRef(zoomFactor);
  const latestResolutionScaleRef = useRef(1);
  const [pid, setPid] = useState<number | null>(null);
  const [isCrashed, setIsCrashed] = useState(false);
  const [crashReason, setCrashReason] = useState<string | null>(null);
  const [gameViewport, setGameViewport] = useState<GameViewportMetrics>({
    containerWidth: DEFAULT_GAME_WIDTH,
    width: DEFAULT_GAME_WIDTH,
    height: 720,
    resolutionScale: 1,
  });

  const renderWidth = Math.max(
    1,
    Math.round(gameViewport.width * gameViewport.resolutionScale),
  );
  const actualResolutionScale = renderWidth / gameViewport.width;
  const renderHeight = Math.max(
    1,
    Math.round(gameViewport.height * actualResolutionScale),
  );
  const isOverflowingWidth = gameViewport.width > gameViewport.containerWidth;

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

  useEffect(() => {
    latestZoomRef.current = zoomFactor;
    applyZoom();
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

    let frameId = 0;
    const mode = gameResolutionMode || "auto";

    const updateViewport = () => {
      if (frameId) {
        window.cancelAnimationFrame(frameId);
      }

      frameId = window.requestAnimationFrame(() => {
        const next = getGameViewportMetrics(container, mode);
        setGameViewport((current) =>
          current.containerWidth === next.containerWidth &&
          current.width === next.width &&
          current.height === next.height &&
          current.resolutionScale === next.resolutionScale
            ? current
            : next,
        );
      });
    };

    updateViewport();

    const observer = new ResizeObserver(updateViewport);
    observer.observe(container);
    window.addEventListener("resize", updateViewport);
    window.visualViewport?.addEventListener("resize", updateViewport);

    return () => {
      if (frameId) {
        window.cancelAnimationFrame(frameId);
      }
      observer.disconnect();
      window.removeEventListener("resize", updateViewport);
      window.visualViewport?.removeEventListener("resize", updateViewport);
    };
  }, [gameResolutionMode]);

  useEffect(() => {
    if (!webviewRef.current) {
      return;
    }

    const webview = webviewRef.current;

    const onDomReady = async () => {
      setIsCrashed(false);
      setCrashReason(null);
      applyZoom();
      try {
        // Get the actual Flash plugin process PID instead of the webview PID
        const osPid = await window.electron.getFlashPid();
        setPid(osPid);
      } catch (e) {
        console.warn("Failed to get Flash PID:", e);
      }
    };

    const onCrashed = (e: any) => {
      console.error("Webview crashed:", e);
      setIsCrashed(true);
      setCrashReason(e.reason || "unknown");
    };

    const onPluginCrashed = (e: any) => {
      console.error("Flash plugin crashed:", e);
      setIsCrashed(true);
      setCrashReason("plugin-crashed");
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
    };
  }, [id, url, applyZoom]);

  const handleZoom = (delta: number) => {
    const newZoom = Math.max(0.2, Math.min(3, zoomFactor + delta));
    updateZoom(id, newZoom);
  };

  const resetZoom = () => updateZoom(id, 1);

  const handleReload = () => {
    if (webviewRef.current) {
      setIsCrashed(false);
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
      <div className="flex-grow pt-10 overflow-hidden bg-zinc-900 relative">
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
          className={`w-full h-full overflow-auto flex items-start ${
            isOverflowingWidth ? "justify-start" : "justify-center"
          }`}
        >
          <div
            className="relative h-full flex-shrink-0 overflow-hidden bg-black shadow-2xl"
            style={{ width: `${gameViewport.width}px` }}
          >
            <webview
              ref={webviewRef}
              src={url}
              {...WEBVIEW_FLASH_PROPS} // Enable Flash & Popups
              className={`absolute left-0 top-0 bg-black transition-opacity duration-300 ${isCrashed ? 'opacity-0' : 'opacity-100'}`}
              style={{
                width: `${renderWidth}px`,
                height: `${renderHeight}px`,
                transform: `scale(${1 / actualResolutionScale})`,
                transformOrigin: "top left",
              }}
            />
          </div>
        </div>
      </div>
    </div>
  );
};
