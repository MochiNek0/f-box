import React, { useState, useEffect, useRef } from "react";
import { Check, X } from "lucide-react";

interface OCRSelectionOverlayProps {
  onComplete: (data: {
    x: number;
    y: number;
    w: number;
    h: number;
    text: string;
  }) => void;
  onCancel: () => void;
}

export const OCRSelectionOverlay: React.FC<OCRSelectionOverlayProps> = ({
  onComplete,
  onCancel,
}) => {
  const [screenshot, setScreenshot] = useState<string | null>(null);
  const [startPos, setStartPos] = useState<{ x: number; y: number } | null>(
    null,
  );
  const [currentPos, setCurrentPos] = useState<{ x: number; y: number } | null>(
    null,
  );
  const [isSelecting, setIsSelecting] = useState(false);
  const [expectedText, setExpectedText] = useState("");
  const [showInput, setShowInput] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const fetchScreenshot = async () => {
      const result = await window.electron.automation.getScreenshot();
      if (result && typeof result === "object" && "data" in result && result.data) {
        setScreenshot(result.data);
      } else {
        console.error("Failed to get screenshot:", result);
        onCancel();
      }
    };
    fetchScreenshot();
  }, [onCancel]);

  const handleMouseDown = (e: React.MouseEvent) => {
    if (showInput) return;
    setStartPos({ x: e.clientX, y: e.clientY });
    setCurrentPos({ x: e.clientX, y: e.clientY });
    setIsSelecting(true);
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isSelecting) return;
    setCurrentPos({ x: e.clientX, y: e.clientY });
  };

  const handleMouseUp = () => {
    if (!isSelecting) return;
    setIsSelecting(false);
    if (startPos && currentPos) {
      const w = Math.abs(currentPos.x - startPos.x);
      const h = Math.abs(currentPos.y - startPos.y);
      if (w > 5 && h > 5) {
        setShowInput(true);
      }
    }
  };

  const rect =
    startPos && currentPos
      ? {
          x: Math.min(startPos.x, currentPos.x),
          y: Math.min(startPos.y, currentPos.y),
          w: Math.abs(currentPos.x - startPos.x),
          h: Math.abs(currentPos.y - startPos.y),
        }
      : null;

  const handleConfirm = () => {
    if (rect) {
      onComplete({ ...rect, text: expectedText });
    }
  };

  if (!screenshot) return null;

  return (
    <div
      className="fixed inset-0 z-[10000] cursor-crosshair bg-blackSelect-none"
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      ref={containerRef}
    >
      <img
        src={screenshot}
        className="w-full h-full object-cover pointer-events-none"
        alt="screenshot"
      />

      <div className="absolute inset-0 bg-black/40 pointer-events-none" />

      {rect && (
        <div
          className="absolute border-2 border-accent ring-1 ring-white/20 shadow-[0_0_0_9999px_rgba(0,0,0,0.4)] transition-none shadow-accent/20"
          style={{
            left: rect.x,
            top: rect.y,
            width: rect.w,
            height: rect.h,
          }}
        >
          {showInput && (
            <div className="absolute top-full left-0 mt-gr-2 glass-card p-gr-4 min-w-[320px] pointer-events-auto shadow-2xl">
              <label className="block text-[10px] font-black text-zinc-500 uppercase tracking-widest mb-gr-2">
                期待出现的文字 (OCR) - 可用 | 隔开多组
              </label>
              <input
                type="text"
                autoFocus
                value={expectedText}
                onChange={(e) => setExpectedText(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleConfirm()}
                placeholder="在此输入匹配文字，多组可用 | 隔开..."
                className="w-full bg-white/5 border border-border rounded-gr-2 px-gr-3 py-gr-2 text-sm text-zinc-100 focus:outline-none focus:border-accent transition-all"
              />
              <div className="flex gap-gr-3 mt-gr-4 justify-end">
                <button
                  onClick={onCancel}
                  className="px-gr-3 py-gr-2 text-xs text-zinc-500 hover:text-foreground font-bold uppercase tracking-tighter smooth-transition"
                >
                  取消
                </button>
                <button
                  onClick={handleConfirm}
                  className="flex items-center gap-gr-2 premium-gradient shadow-lg shadow-primary/20 px-gr-4 py-gr-2 rounded-gr-2 text-xs font-black text-white hover:opacity-90 smooth-transition"
                >
                  <Check size={14} />
                  确认设置
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {!showInput && (
        <div className="absolute top-10 left-1/2 -translate-x-1/2 bg-black/80 px-4 py-2 rounded-full text-white text-sm font-medium border border-white/10 backdrop-blur pointer-events-none">
          {isSelecting ? "释放鼠标完成选区" : "拖动鼠标选择 OCR 识别区域"}
        </div>
      )}

      <button
        onClick={onCancel}
        className="absolute top-6 right-6 p-2 bg-black/60 hover:bg-black/80 rounded-full text-white/60 hover:text-white transition-colors"
      >
        <X size={20} />
      </button>
    </div>
  );
};
