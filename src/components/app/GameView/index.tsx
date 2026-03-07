import React, { useRef, useEffect, useState, useCallback } from "react";
import { useTabStore } from "../../../store/useTabStore";
import { ZoomIn, ZoomOut, RefreshCw, ArrowLeft, Maximize2 } from "lucide-react";
import { IconButton } from "../../common/IconButton";

interface GameViewProps {
  id: string;
  url: string;
}

type FlashWebviewElement = HTMLElement & {
  setZoomFactor: (factor: number) => void;
  openDevTools: () => void;
};

const WEBVIEW_FLASH_PROPS: Record<string, string> = {
  plugins: "true",
  allowpopups: "true",
  disablewebsecurity: "true",
  webpreferences: "plugins=yes",
};

export const GameView: React.FC<GameViewProps> = ({ id, url }) => {
  const { backToLibrary, updateZoom, tabs } = useTabStore();
  const tab = tabs.find((t) => t.id === id);
  const zoomFactor = tab?.zoomFactor || 1;

  const webviewRef = useRef<FlashWebviewElement | null>(null);
  const latestZoomRef = useRef(zoomFactor);
  const [pid, setPid] = useState<number | null>(null);

  const applyZoom = useCallback(() => {
    if (!webviewRef.current) {
      return;
    }

    try {
      webviewRef.current.setZoomFactor(latestZoomRef.current);
    } catch (e) {
      console.warn("Failed to set zoom factor:", e);
    }
  }, []);

  useEffect(() => {
    latestZoomRef.current = zoomFactor;
    applyZoom();
  }, [zoomFactor, applyZoom]);

  useEffect(() => {
    if (!webviewRef.current) {
      return;
    }

    const webview = webviewRef.current;

    const onDomReady = async () => {
      applyZoom();
      try {
        // Get the actual Flash plugin process PID instead of the webview PID
        const osPid = await window.electron.getFlashPid();
        setPid(osPid);
      } catch (e) {
        console.warn("Failed to get Flash PID:", e);
      }
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

    return () => {
      webview.removeEventListener("dom-ready", onDomReady);
      webview.removeEventListener("did-finish-load", onNavigation);
      webview.removeEventListener("did-navigate", onNavigation);
      webview.removeEventListener("did-navigate-in-page", onNavigation);
      webview.removeEventListener("did-stop-loading", onNavigation);
    };
  }, [id, url, applyZoom]);

  const handleZoom = (delta: number) => {
    const newZoom = Math.max(0.2, Math.min(3, zoomFactor + delta));
    updateZoom(id, newZoom);
  };

  const resetZoom = () => updateZoom(id, 1);

  return (
    <div className="flex flex-col h-full bg-zinc-950 overflow-hidden relative">
      {/* Toolbar */}
      <div className="h-10 bg-zinc-900/80 backdrop-blur-md flex items-center justify-between px-2 md:px-4 border-b border-zinc-800 absolute top-0 left-0 right-0 z-10 transition-opacity">
        <div className="flex items-center gap-2 md:gap-4 flex-shrink">
          <IconButton
            icon={<ArrowLeft size={16} />}
            onClick={() => backToLibrary(id)}
            title="返回库"
            className="flex items-center gap-2"
          />
          <div className="h-4 w-px bg-zinc-800 hidden md:block" />
          <div className="text-[10px] text-zinc-500 truncate max-w-[150px] md:max-w-[300px] hidden sm:block">
            {url}
          </div>
          {pid && (
            <>
              <div className="h-4 w-px bg-zinc-800 hidden md:block" />
              <div
                className="text-[10px] text-emerald-400 font-mono hidden sm:flex items-center gap-1 cursor-help"
                title="Flash Plugin Process ID (在 CE 中附加此进程以进行变速)"
              >
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                CE PID: {pid}
              </div>
            </>
          )}
        </div>

        <div className="flex items-center gap-1 bg-zinc-800/50 p-1 rounded-lg flex-shrink-0">
          <IconButton
            icon={<ZoomOut size={16} />}
            onClick={() => handleZoom(-0.1)}
            title="缩小"
          />
          <div className="w-8 md:w-12 text-center text-[10px] font-bold text-zinc-300">
            {Math.round(zoomFactor * 100)}%
          </div>
          <IconButton
            icon={<ZoomIn size={16} />}
            onClick={() => handleZoom(0.1)}
            title="放大"
          />
          <IconButton
            icon={<RefreshCw size={14} />}
            onClick={resetZoom}
            title="重置缩放"
          />
        </div>
      </div>

      {/* Webview Container */}
      <div className="flex-grow flex justify-center items-start pt-10 overflow-auto bg-zinc-900">
        <div className="w-full h-full flex justify-center">
          {/* @ts-expect-error Electron webview tag */}
          <webview
            ref={webviewRef}
            src={url}
            {...WEBVIEW_FLASH_PROPS} // Enable Flash & Popups
            className="w-full h-full bg-black shadow-2xl"
            style={{ width: "1280px", height: "100%" }}
          />
        </div>
      </div>

      <div className="absolute bottom-4 right-4 z-20">
        <IconButton
          icon={<Maximize2 size={16} />}
          onClick={() => webviewRef.current?.openDevTools()}
          className="bg-zinc-800/80 backdrop-blur border border-zinc-700"
        />
      </div>
    </div>
  );
};
