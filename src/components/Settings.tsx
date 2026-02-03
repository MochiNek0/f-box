import React, { useState, useEffect } from "react";
import { useSettingsStore } from "../store/useSettingsStore";
import { Keyboard } from "lucide-react";

export const Settings: React.FC = () => {
  const { bossKey, setBossKey } = useSettingsStore();
  const [isRecording, setIsRecording] = useState(false);

  const handleKeyDown = (e: KeyboardEvent) => {
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
      window.addEventListener("keydown", handleKeyDown);
    }
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isRecording]);

  return (
    <div className="flex-grow flex flex-col items-center justify-start p-8 bg-zinc-950 overflow-y-auto">
      <div className="w-full max-w-2xl bg-zinc-900/50 border border-zinc-800 p-8 rounded-3xl shadow-xl">
        <h2 className="text-2xl font-bold text-zinc-100 mb-8 flex items-center gap-3">
          <Keyboard className="text-orange-500" size={28} />
          软件设置
        </h2>

        <div className="space-y-8">
          <section className="bg-zinc-800/30 p-6 rounded-2xl border border-zinc-800/50">
            <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-[0.2em] mb-4">
              快捷键设置 (Hotkeys)
            </label>
            <div className="space-y-4">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm text-zinc-300">
                    老板键 (Boss Key)
                  </span>
                  <p className="text-[10px] text-zinc-500 italic">
                    按键后立即隐藏/显示所有窗口
                  </p>
                </div>
                <div className="flex gap-3">
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
                  <button
                    onClick={() => setIsRecording(!isRecording)}
                    className={`px-6 py-3 rounded-xl font-semibold text-sm transition-all duration-300 outline-none ${
                      isRecording
                        ? "bg-red-500/10 text-red-500 hover:bg-red-500/20"
                        : "bg-orange-500 text-white hover:bg-orange-600 shadow-lg shadow-orange-500/20"
                    }`}
                  >
                    {isRecording ? "取消" : "修改"}
                  </button>
                </div>
              </div>
            </div>
          </section>

          <section className="bg-zinc-800/30 p-6 rounded-2xl border border-zinc-800/50">
            <h3 className="text-[10px] font-bold text-zinc-500 uppercase tracking-[0.2em] mb-4">
              关于 (About)
            </h3>
            <div className="space-y-2">
              <p className="text-sm text-zinc-300 font-medium">
                Flash Box v1.1.0
              </p>
              <p className="text-[11px] text-zinc-500 leading-relaxed">
                为您提供极速、流畅、高清的 Flash 网页游戏体验。
                <br />
                内置系统级 Flash 插件优化与多任务并行处理。
              </p>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
};
