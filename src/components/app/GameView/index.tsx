import React, { useRef, useEffect, useState, useCallback } from "react";
import { useTabStore } from "../../../store/useTabStore";
import { ZoomIn, ZoomOut, RefreshCw, ArrowLeft } from "lucide-react";
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
      <div className="flex-grow flex justify-center items-start pt-10 overflow-auto bg-zinc-900">
        <div className="w-full h-full flex justify-center">
          <webview
            ref={webviewRef}
            src={url}
            {...WEBVIEW_FLASH_PROPS} // Enable Flash & Popups
            className="w-full h-full bg-black shadow-2xl"
            style={{ width: "1280px", height: "100%" }}
          />
        </div>
      </div>
    </div>
  );
};
