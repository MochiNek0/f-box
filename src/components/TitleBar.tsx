import React, { useState } from "react";
import { Minus, Square, X, Settings, SunDim } from "lucide-react";

interface TitleBarProps {
  onOpenSettings: () => void;
}

export const TitleBar: React.FC<TitleBarProps> = ({ onOpenSettings }) => {
  const [opacity, setOpacity] = useState(1);

  const handleOpacityChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value);
    setOpacity(val);
    window.electron.setOpacity(val);
  };

  return (
    <div
      className="h-10 bg-zinc-900 flex items-center justify-between select-none"
      style={{ WebkitAppRegion: "drag" } as any}
    >
      <div className="flex items-center px-4 gap-2">
        <div className="w-5 h-5 bg-orange-500 rounded flex items-center justify-center">
          <span className="text-white text-[10px] font-bold">F</span>
        </div>
        <span className="text-zinc-300 text-sm font-medium max-md:hidden">
          Flash Game Browser
        </span>
      </div>

      <div
        className="flex items-center h-full no-drag"
        style={{ WebkitAppRegion: "no-drag" } as any}
      >
        {/* Settings Button */}
        <button
          onClick={onOpenSettings}
          className="h-full px-4 flex bg-transparent items-center cursor-pointer group outline-none"
        >
          <Settings
            size={14}
            className="text-zinc-500 group-hover:text-white"
          />
        </button>

        {/* Opacity Slider */}
        <div className="flex items-center gap-2 px-4 border-r border-zinc-800">
          <SunDim size={14} className="text-zinc-500" />
          <input
            type="range"
            min="0.3"
            max="1"
            step="0.05"
            value={opacity}
            onChange={handleOpacityChange}
            className="w-24 h-1 bg-zinc-700 rounded-lg appearance-none cursor-pointer accent-orange-500"
          />
          <span className="text-[10px] text-zinc-500 w-6">
            {Math.round(opacity * 100)}%
          </span>
        </div>

        {/* Window Controls */}
        <div
          onClick={() => window.electron.windowControls("minimize")}
          className="h-full px-4 flex items-center hover:bg-zinc-800 transition-colors cursor-pointer group"
        >
          <Minus size={16} className="text-zinc-400 group-hover:text-white" />
        </div>
        <div
          onClick={() => window.electron.windowControls("maximize")}
          className="h-full px-4 flex items-center hover:bg-zinc-800 transition-colors cursor-pointer group"
        >
          <Square size={12} className="text-zinc-400 group-hover:text-white" />
        </div>
        <div
          onClick={() => window.electron.windowControls("close")}
          className="h-full px-4 flex items-center hover:bg-red-500/80 transition-colors cursor-pointer group"
        >
          <X size={16} className="text-zinc-400 group-hover:text-white" />
        </div>
      </div>
    </div>
  );
};
