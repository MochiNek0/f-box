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
    window.electron.automation.onStatus((status: string) => {
      if (status === "STATUS|RECORDING") {
        setIsRecording(true);
      } else if (
        status === "STATUS|RECORD_DONE" ||
        status === "STATUS|PROCESS_EXIT"
      ) {
        setIsRecording(false);
        // Logic to close toolbar and reopen settings is handled by the stop button
      }
    });

    return () => {
      window.electron.automation.offStatus();
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
    <div className="fixed bottom-10 left-1/2 -translate-x-1/2 z-[9999] flex items-center gap-4 bg-zinc-900/90 backdrop-blur-md border border-zinc-700/50 rounded-full px-6 py-3 shadow-2xl ring-1 ring-white/10">
      <div className="flex items-center gap-3">
        {isRecording ? (
          <IconButton
            icon={<Square size={20} className="text-white" />}
            onClick={handleStop}
            className="bg-red-600 hover:bg-red-700 w-10 h-10 rounded-full"
            title="停止录制"
          />
        ) : (
          <IconButton
            icon={<Circle size={20} className="text-red-500 fill-red-500" />}
            onClick={handleStart}
            className="bg-zinc-800 hover:bg-zinc-700 w-10 h-10 rounded-full"
            title="开始录制"
          />
        )}
      </div>

      <div className="h-6 w-[1px] bg-zinc-700/50" />

      <div className="flex flex-col min-w-[80px]">
        <span className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider">
          {status === "正在保存..."
            ? "SAVING"
            : isRecording
              ? "RECORDING"
              : "READY"}
        </span>
        <span className="text-xs text-zinc-200 font-medium truncate max-w-[120px]">
          {status === "正在保存..." ? status : initialName}
        </span>
      </div>

      <IconButton
        icon={<X size={14} />}
        onClick={onClose}
        className="text-zinc-500 hover:text-zinc-300 ml-2"
        title="关闭工具栏"
      />
    </div>
  );
};
