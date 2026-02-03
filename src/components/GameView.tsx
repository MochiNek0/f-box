import React, { useRef, useEffect } from "react";
import { useTabStore } from "../store/useTabStore";
import { ZoomIn, ZoomOut, RefreshCw, ArrowLeft, Maximize2 } from "lucide-react";

interface GameViewProps {
  id: string;
  url: string;
}

export const GameView: React.FC<GameViewProps> = ({ id, url }) => {
  const { backToLibrary, updateZoom, tabs } = useTabStore();
  const tab = tabs.find((t) => t.id === id);
  const zoomFactor = tab?.zoomFactor || 1;
  const webviewRef = useRef<any>(null);

  useEffect(() => {
    if (webviewRef.current) {
      const webview = webviewRef.current;

      const applyZoom = () => {
        try {
          webview.setZoomFactor(zoomFactor);
        } catch (e) {
          console.warn("Failed to set zoom factor:", e);
        }
      };

      const onDomReady = () => {
        applyZoom();
      };

      const onDidFinishLoad = () => {
        applyZoom();
      };

      webview.addEventListener("dom-ready", onDomReady);
      webview.addEventListener("did-finish-load", onDidFinishLoad);

      return () => {
        webview.removeEventListener("dom-ready", onDomReady);
        webview.removeEventListener("did-finish-load", onDidFinishLoad);
      };
    }
  }, [id, url]); // Re-bind if id or url changes significantly, though usually id is enough

  useEffect(() => {
    if (webviewRef.current) {
      try {
        webviewRef.current.setZoomFactor(zoomFactor);
      } catch (e) {
        console.warn("Failed to set zoom factor:", e);
      }
    }
  }, [zoomFactor]);

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
          <button
            onClick={() => backToLibrary(id)}
            className="p-1.5 rounded-md bg-transparent hover:bg-zinc-800 text-zinc-400 hover:text-white transition-all flex items-center gap-2 outline-none flex-shrink-0"
            title="返回库"
          >
            <ArrowLeft size={16} />
          </button>
          <div className="h-4 w-px bg-zinc-800 hidden md:block" />
          <div className="text-[10px] text-zinc-500 truncate max-w-[150px] md:max-w-[300px] hidden sm:block">
            {url}
          </div>
        </div>

        <div className="flex items-center gap-1 bg-zinc-800/50 p-1 rounded-lg flex-shrink-0">
          <button
            onClick={() => handleZoom(-0.1)}
            className="p-1 rounded-md bg-transparent hover:bg-zinc-700 text-zinc-400 hover:text-white transition-all outline-none"
            title="缩小"
          >
            <ZoomOut size={16} />
          </button>
          <div className="w-8 md:w-12 text-center text-[10px] font-bold text-zinc-300">
            {Math.round(zoomFactor * 100)}%
          </div>
          <button
            onClick={() => handleZoom(0.1)}
            className="p-1 rounded-md bg-transparent hover:bg-zinc-700 text-zinc-400 hover:text-white transition-all outline-none"
            title="放大"
          >
            <ZoomIn size={16} />
          </button>
          <button
            onClick={resetZoom}
            className="p-1 rounded-md bg-transparent hover:bg-zinc-700 text-zinc-400 hover:text-white transition-all outline-none"
            title="重置缩放"
          >
            <RefreshCw size={14} />
          </button>
        </div>
      </div>

      {/* Webview Container */}
      <div className="flex-grow flex justify-center items-start pt-10 overflow-auto bg-zinc-900">
        <div
          style={{
            width: "100%",
            height: "100%",
            display: "flex",
            justifyContent: "center",
          }}
          className=""
        >
          {/* @ts-ignore */}
          <webview
            ref={webviewRef}
            src={url}
            {...({ plugins: "true" } as any)} // Enable Flash
            className="w-full h-full bg-black shadow-2xl"
            style={{ width: "1280px", height: "100%" }} // Initial fixed width to enable centering logic
          />
        </div>
      </div>

      <div className="absolute bottom-4 right-4 z-20">
        <button
          onClick={() => webviewRef.current?.openDevTools()}
          className="p-2 bg-zinc-800/80 backdrop-blur rounded-full text-zinc-500 hover:text-zinc-300 border border-zinc-700 outline-none"
        >
          <Maximize2 size={16} />
        </button>
      </div>
    </div>
  );
};
