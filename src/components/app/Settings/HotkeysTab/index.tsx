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
      window.electron.suspendBossKey();
      window.addEventListener("keydown", handleGlobalKeyDown);
    } else {
      // Small delay to ensure the key release doesn't trigger the boss key immediately if it was the boss key itself
      // (though usually resumeBossKey just re-registers, it doesn't trigger)
      window.electron.resumeBossKey();
    }
    return () => {
      window.removeEventListener("keydown", handleGlobalKeyDown);
    };
  }, [isRecording]);

  // Ensure Boss Key is resumed when component unmounts if it was recording
  useEffect(() => {
    return () => {
      window.electron.resumeBossKey();
    };
  }, []);

  return (
    <section className="glass p-gr-4 rounded-gr-4">
      <label className="block text-[10px] font-black text-zinc-500 uppercase tracking-widest mb-gr-3">
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
          <div className="flex gap-gr-3 max-md:flex-col">
            <div
              className={`flex-grow bg-white/5 border ${
                isRecording
                  ? "border-primary shadow-[0_0_15px_rgba(var(--primary),0.1)]"
                  : "border-border"
              } rounded-gr-3 px-gr-4 py-gr-3 text-zinc-200 flex items-center justify-between transition-all duration-300`}
            >
              <span className="font-mono text-sm tracking-widest">
                {isRecording ? (
                  <span className="text-primary animate-pulse">
                    正在录制按键...
                  </span>
                ) : (
                  bossKey
                )}
              </span>
              {isRecording && (
                <div className="w-1.5 h-1.5 bg-primary rounded-full animate-ping shadow-[0_0_8px_rgba(var(--primary),0.5)]" />
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
