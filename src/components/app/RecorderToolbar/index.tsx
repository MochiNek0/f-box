import React, { useState, useEffect } from "react";
import { Circle, Square, X } from "lucide-react";
import { IconButton } from "../../common/IconButton";

interface RecorderToolbarProps {
  initialName: string;
  onClose: () => void;
}

export const RecorderToolbar: React.FC<RecorderToolbarProps> = ({
  initialName,
  onClose,
}) => {
  const [isRecording, setIsRecording] = useState(false);
  const [status, setStatus] = useState("准备就绪");

  useEffect(() => {
    const detachStatus = window.electron.automation.onStatus((status: string) => {
      if (status === "STATUS|RECORDING") {
        setIsRecording(true);
      } else if (status === "STATUS|RECORD_DONE") {
        setIsRecording(false);
        onClose(); // Auto-close when recording is done (handles F10 stop)
      } else if (status === "STATUS|PROCESS_EXIT") {
        setIsRecording(false);
      }
    });

    return () => {
      detachStatus();
    };
  }, []);

  const handleStart = async () => {
    if (!initialName) return;
    const result = await window.electron.automation.startRecord(initialName);
    if (!result.success) {
      alert(`启动录制失败: ${result.error}`);
    }
  };

  const handleStop = async () => {
    setStatus("正在保存...");
    await window.electron.automation.stopRecord();
    setIsRecording(false);
    onClose(); // This should trigger reopening settings
  };

  return (
    <div className="fixed bottom-10 left-1/2 -translate-x-1/2 z-[9999] flex items-center gap-gr-4 glass border border-white/10 rounded-gr-8 px-gr-6 py-gr-3 shadow-2xl">
      <div className="flex items-center gap-gr-3">
        {isRecording ? (
          <IconButton
            icon={<Square size={20} className="text-white fill-white" />}
            onClick={handleStop}
            className="bg-red-500 hover:bg-red-600 w-10 h-10 rounded-full shadow-[0_0_15px_rgba(239,68,68,0.4)] animate-pulse border border-red-400/20"
            title="停止录制"
          />
        ) : (
          <IconButton
            icon={<Circle size={20} className="text-primary fill-primary" />}
            onClick={handleStart}
            className="bg-white/10 hover:bg-white/20 w-10 h-10 rounded-full border border-white/20 shadow-md"
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
        icon={<X size={14} />}
        onClick={onClose}
        className="text-zinc-500 hover:text-foreground ml-gr-2"
        title="关闭工具栏"
      />
    </div>
  );
};
