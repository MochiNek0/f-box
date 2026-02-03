import React from "react";
import { Gamepad2, Settings as SettingsIcon } from "lucide-react";

interface SidebarProps {
  activeView: "game" | "settings";
  onViewChange: (view: "game" | "settings") => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  activeView,
  onViewChange,
}) => {
  return (
    <div className="flex flex-col items-center py-4 px-2 bg-zinc-900 border-r border-zinc-800 flex-shrink-0 z-20">
      <button
        onClick={() => onViewChange("game")}
        className={`p-1 rounded-xl transition-all duration-200 mb-2 outline-none ${
          activeView === "game"
            ? "bg-orange-500 text-white shadow-[0_0_15px_rgba(249,115,22,0.4)]"
            : "text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800"
        }`}
        title="游戏区域"
      >
        <Gamepad2 size={16} />
      </button>

      <button
        onClick={() => onViewChange("settings")}
        className={`p-1 rounded-xl transition-all duration-200 outline-none ${
          activeView === "settings"
            ? "bg-orange-500 text-white shadow-[0_0_15px_rgba(249,115,22,0.4)]"
            : "text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800"
        }`}
        title="设置"
      >
        <SettingsIcon size={16} />
      </button>
    </div>
  );
};
