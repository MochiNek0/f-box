import React, { useState, useEffect } from "react";
import { useSettingsStore } from "../../../../store/useSettingsStore";
import { Button } from "../../../common/Button";

export const HotkeysTab: React.FC = () => {
  const { bossKey, setBossKey } = useSettingsStore();
  const [isRecording, setIsRecording] = useState(false);

  const handleGlobalKeyDown = (e: KeyboardEvent) => {
    if (isRecording) {
      e.preventDefault();
      e.stopPropagation();

      const combination = [
        e.ctrlKey ? "Control" : "",
        e.shiftKey ? "Shift" : "",
        e.altKey ? "Alt" : "",
        e.metaKey ? "Command" : "",
        e.key !== "Control" &&
        e.key !== "Shift" &&
        e.key !== "Alt" &&
        e.key !== "Meta"
          ? e.key === " "
            ? "Space"
            : e.key
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
      window.addEventListener("keydown", handleGlobalKeyDown);
    }
    return () => window.removeEventListener("keydown", handleGlobalKeyDown);
  }, [isRecording]);

  return (
    <section className="bg-zinc-800/30 p-6 rounded-2xl border border-zinc-800/50">
      <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-[0.2em] mb-4">
        快捷键设置 (Hotkeys)
      </label>
      <div className="space-y-4">
        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm text-zinc-300">老板键</span>
            <p className="text-[10px] text-zinc-500 italic max-md:hidden">
              按键后立即隐藏/显示所有窗口
            </p>
          </div>
          <div className="flex gap-3 max-md:flex-col">
            <div
              className={`flex-grow bg-zinc-900 border ${
                isRecording
                  ? "border-orange-500 shadow-[0_0_15px_rgba(249,115,22,0.1)]"
                  : "border-zinc-700"
              } rounded-xl px-4 py-3 text-zinc-200 flex items-center justify-between transition-all duration-300`}
            >
              <span className="font-mono text-sm tracking-widest">
                {isRecording ? (
                  <span className="text-orange-400 animate-pulse">
                    正在录制按键...
                  </span>
                ) : (
                  bossKey
                )}
              </span>
              {isRecording && (
                <div className="w-1.5 h-1.5 bg-orange-500 rounded-full animate-ping" />
              )}
            </div>
            <Button
              onClick={() => setIsRecording(!isRecording)}
              variant={isRecording ? "danger" : "primary"}
            >
              {isRecording ? "取消" : "修改"}
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
};
