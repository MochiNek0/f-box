import React, { useCallback, useEffect, useRef } from "react";
import { usePointPickStore } from "../../../store/usePointPickStore";

// Transparent click-capture layer rendered by GameView over the target
// game's <webview> while ClickerTab is waiting for the user to pick a mouse
// position. A single click resolves the pick as normalized (0..1) fractions
// of the overlay's own rect — the same nx/ny convention RecordingOverlay uses
// (see its toCoords), so the coordinate is portable across window size/zoom
// at playback time.
export const PointPickOverlay: React.FC = () => {
  const overlayRef = useRef<HTMLDivElement | null>(null);

  const handleClick = useCallback((e: React.MouseEvent) => {
    const el = overlayRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const nx = Math.min(1, Math.max(0, (e.clientX - rect.left) / (rect.width || 1)));
    const ny = Math.min(1, Math.max(0, (e.clientY - rect.top) / (rect.height || 1)));
    usePointPickStore.getState().complete(nx, ny);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") usePointPickStore.getState().cancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div
      ref={overlayRef}
      className="absolute inset-0 z-10 outline-none cursor-crosshair"
      onClick={handleClick}
      onContextMenu={(e) => {
        e.preventDefault();
        usePointPickStore.getState().cancel();
      }}
    >
      <div className="absolute inset-0 pointer-events-none border-2 border-primary/70" />
      <div className="absolute top-2 left-1/2 -translate-x-1/2 pointer-events-none flex items-center gap-2 bg-black/70 border border-primary/40 rounded-full px-3 py-1">
        <span className="text-[10px] text-primary font-black uppercase tracking-widest">
          点击选择坐标 · Esc 取消
        </span>
      </div>
    </div>
  );
};
