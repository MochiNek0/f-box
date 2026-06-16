import React from "react";
import { Maximize2, Monitor } from "lucide-react";
import {
  type GameResolutionMode,
  useSettingsStore,
} from "../../../../store/useSettingsStore";

const RESOLUTION_OPTIONS: Array<{
  id: GameResolutionMode;
  label: string;
  detail: string;
  icon: React.ReactNode;
}> = [
  {
    id: "auto",
    label: "自动",
    detail: "匹配屏幕",
    icon: <Monitor size={18} />,
  },
  {
    id: "native",
    label: "原始",
    detail: "固定 1280",
    icon: <Maximize2 size={18} />,
  },
];

export const DisplayTab: React.FC = () => {
  const { gameResolutionMode, setGameResolutionMode } = useSettingsStore();

  return (
    <section className="glass p-gr-4 rounded-gr-4">
      <label className="block text-[10px] font-black text-zinc-500 uppercase tracking-widest mb-gr-3">
        游戏画面分辨率
      </label>
      <div className="grid grid-cols-2 gap-gr-3">
        {RESOLUTION_OPTIONS.map((option) => {
          const isActive = gameResolutionMode === option.id;

          return (
            <button
              key={option.id}
              type="button"
              aria-pressed={isActive}
              onClick={() => setGameResolutionMode(option.id)}
              className={`min-h-16 rounded-gr-3 border px-gr-4 py-gr-3 text-left transition-all smooth-transition ${
                isActive
                  ? "border-primary/60 bg-primary/10 text-primary shadow-[0_0_18px_hsl(var(--primary)_/_0.12)]"
                  : "border-white/5 bg-white/5 text-zinc-300 hover:border-white/15 hover:bg-white/10"
              }`}
            >
              <div className="flex items-center gap-gr-2">
                <span
                  className={`inline-flex h-8 w-8 items-center justify-center rounded-gr-2 ${
                    isActive ? "bg-primary/15" : "bg-black/20"
                  }`}
                >
                  {option.icon}
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-black">
                    {option.label}
                  </span>
                  <span className="block truncate text-[10px] font-bold text-zinc-500">
                    {option.detail}
                  </span>
                </span>
              </div>
            </button>
          );
        })}
      </div>
    </section>
  );
};
