import React, { useState, useEffect, useRef } from "react";
import { Circle, Square, X } from "lucide-react";
import { IconButton } from "../../common/IconButton";
import { useTabStore } from "../../../store/useTabStore";
import { getGeometryForTab } from "../../../store/gameViewRegistry";
import { useRecordingStore } from "../../../store/useRecordingStore";

interface RecorderToolbarProps {
  initialName: string;
  onClose: () => void;
}

export const RecorderToolbar: React.FC<RecorderToolbarProps> = ({
  initialName,
  onClose,
}) => {
  const isRecording = useRecordingStore((s) => s.recordingTabId !== null);
  const [status, setStatus] = useState("准备就绪");
  const wasRecordingRef = useRef(false);

  // Auto-close once recording ends (stop button here or F10 on the overlay).
  useEffect(() => {
    if (wasRecordingRef.current && !isRecording) {
      onClose();
    }
    wasRecordingRef.current = isRecording;
  }, [isRecording, onClose]);

  const handleStart = () => {
    if (!initialName) return;
    // Recording captures input on an overlay over the active game webview, so
    // a live game tab (with known geometry) is required.
    const tabId = useTabStore.getState().activeTabId;
    const geometry = getGeometryForTab(tabId);
    if (!geometry) {
      alert("请先打开游戏再录制");
      return;
    }
    useRecordingStore.getState().start(tabId, initialName, geometry);
  };

  const handleStop = async () => {
    setStatus("正在保存...");
    const result = await useRecordingStore.getState().stopAndSave();
    if (!result.success) {
      alert(`保存脚本失败: ${result.error}`);
    }
    // onClose fires via the isRecording effect above.
  };

  return (
    <div className="fixed bottom-10 left-1/2 -translate-x-1/2 z-[9999] flex items-center gap-gr-2 glass border border-white/10 rounded-full px-gr-4 py-gr-1 shadow-2xl">
      <div className="flex items-center gap-gr-3">
        {isRecording ? (
          <IconButton
            icon={<Square size={16} className="text-white fill-white" />}
            size="sm"
            onClick={handleStop}
            className="bg-red-500 hover:bg-red-600 w-6 h-6 rounded-full shadow-[0_0_15px_rgba(239,68,68,0.4)] animate-pulse border border-red-400/20"
            title="停止录制"
          />
        ) : (
          <IconButton
            icon={<Circle size={16} className="text-primary fill-primary" />}
            size="sm"
            onClick={handleStart}
            className="bg-white/10 hover:bg-white/20 w-6 h-6 rounded-full border border-white/20 shadow-md"
            title="开始录制"
          />
        )}
      </div>

      <div className="h-gr-4 w-px bg-white/10" />

      <div className="flex flex-col min-w-[80px]">
        <span className="text-[10px] text-zinc-500 font-black uppercase tracking-widest">
          {status === "正在保存..."
            ? "SAVING"
            : isRecording
              ? "RECORDING"
              : "READY"}
        </span>
        <span className="text-xs text-foreground font-black truncate max-w-[120px] uppercase tracking-tighter">
          {status === "正在保存..." ? status : initialName}
        </span>
      </div>

      <IconButton
        icon={<X size={16} />}
        size="sm"
        onClick={onClose}
        className="text-zinc-500 hover:text-foreground ml-gr-1 w-6 h-6 rounded-full border border-zinc-500/20"
        title="关闭工具栏"
      />
    </div>
  );
};
