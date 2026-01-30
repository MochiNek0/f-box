import React, { useState, useEffect } from "react";
import { useSettingsStore } from "../store/useSettingsStore";
import { Keyboard, X } from "lucide-react";

interface SettingsProps {
  onClose: () => void;
}

export const Settings: React.FC<SettingsProps> = ({ onClose }) => {
  const { bossKey, setBossKey } = useSettingsStore();
  const [isRecording, setIsRecording] = useState(false);

  const handleKeyDown = (e: KeyboardEvent) => {
    if (isRecording) {
      e.preventDefault();
      e.stopPropagation();

      // Map key names to Electron globalShortcut format if needed,
      // but 'Escape', 'F1', 'Control+Shift+B' etc usually work.
      let key = e.key;
      if (key === " ") key = "Space";

      const modifiers = [];
      if (e.ctrlKey) modifiers.push("Control");
      if (e.shiftKey) modifiers.push("Shift");
      if (e.altKey) modifiers.push("Alt");
      if (e.metaKey) modifiers.push("Command");

      const combination = [
        ...modifiers,
        key !== "Control" && key !== "Shift" && key !== "Alt" && key !== "Meta"
          ? key
          : "",
      ]
        .filter(Boolean)
        .join("+");

      setBossKey(combination);
      window.electron.updateBossKey(combination);
      setIsRecording(false);
    }
  };

  useEffect(() => {
    if (isRecording) {
      window.addEventListener("keydown", handleKeyDown);
    }
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isRecording]);

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 z-50">
      <div className="bg-zinc-900 border border-zinc-800 p-8 rounded-2xl w-full max-w-md shadow-2xl relative">
        <button
          onClick={onClose}
          className="absolute bg-transparent top-4 right-4 p-2 text-zinc-500 hover:text-white transition-colors outline-none"
        >
          <X size={20} />
        </button>

        <h2 className="text-xl font-bold text-zinc-100 mb-6 flex items-center gap-2">
          <Keyboard className="text-orange-500" size={24} />
          设置
        </h2>

        <div className="space-y-6">
          <div>
            <label className="block text-xs font-medium text-zinc-500 uppercase tracking-wider mb-2">
              老板键 (Boss Key)
            </label>
            <div className="flex gap-4">
              <div
                className={`flex-grow bg-zinc-800 border ${isRecording ? "border-orange-500 shadow-[0_0_10px_rgba(249,115,22,0.2)]" : "border-zinc-700"} rounded-xl px-4 py-3 text-zinc-200 flex items-center justify-between transition-all`}
              >
                <span className="font-mono text-sm">
                  {isRecording ? "请按键..." : bossKey}
                </span>
                {isRecording && (
                  <div className="w-2 h-2 bg-orange-500 rounded-full animate-pulse" />
                )}
              </div>
              <button
                onClick={() => setIsRecording(!isRecording)}
                className={`px-4 py-2 rounded-xl font-medium transition-all ${isRecording ? "bg-red-500 hover:bg-red-600" : "bg-zinc-700 hover:bg-zinc-600"} text-white outline-none`}
              >
                {isRecording ? "取消" : "修改"}
              </button>
            </div>
            <p className="text-[10px] text-zinc-500 mt-2">
              建议使用 Ctrl+Shift+H 或类似组合。默认 Esc。
            </p>
          </div>

          <div className="pt-6 border-t border-zinc-800">
            <h3 className="text-xs font-semibold text-zinc-400 mb-2 uppercase italic">
              关于
            </h3>
            <p className="text-[10px] text-zinc-600 leading-relaxed">
              Flash Game Browser v1.0.0
              <br />
              支持系统级 Flash 插件自动检测与高清缩放。
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
