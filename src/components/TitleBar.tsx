import React, { useState, useEffect } from "react";
import {
  Minus,
  Square,
  X,
  Settings,
  SunDim,
  Menu as MenuIcon,
} from "lucide-react";

interface TitleBarProps {
  onOpenSettings: () => void;
}

export const TitleBar: React.FC<TitleBarProps> = ({ onOpenSettings }) => {
  const [opacity, setOpacity] = useState(1);
  const [isCompact, setIsCompact] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  useEffect(() => {
    const handleResize = () => {
      setIsCompact(window.innerWidth < 430);
    };

    window.addEventListener("resize", handleResize);
    handleResize(); // Initial check

    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const handleOpacityChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value);
    setOpacity(val);
    window.electron.setOpacity(val);
  };

  const toggleMenu = () => {
    setIsMenuOpen(!isMenuOpen);
  };

  return (
    <div
      className="h-10 bg-zinc-900 flex items-center justify-between select-none relative"
      style={{ WebkitAppRegion: "drag" } as any}
    >
      <div className="flex items-center px-4 gap-2">
        <div className="w-5 h-5 bg-orange-500 rounded flex items-center justify-center flex-shrink-0">
          <span className="text-white text-[10px] font-bold">F</span>
        </div>
        {!isCompact && (
          <span className="text-zinc-300 text-sm font-medium">
            Flash Game Browser
          </span>
        )}
      </div>

      <div
        className="flex items-center h-full no-drag"
        style={{ WebkitAppRegion: "no-drag" } as any}
      >
        {/* Settings Button */}
        <button
          onClick={onOpenSettings}
          className="h-full px-3 flex bg-transparent items-center cursor-pointer group outline-none"
          title="设置"
        >
          <Settings
            size={14}
            className="text-zinc-500 group-hover:text-white"
          />
        </button>

        {/* Opacity Slider */}
        <div className="flex items-center gap-2 px-3 border-r border-zinc-800">
          <SunDim size={14} className="text-zinc-500" />
          <input
            type="range"
            min="0.15"
            max="1"
            step="0.05"
            value={opacity}
            onChange={handleOpacityChange}
            className="w-16 h-1 bg-zinc-700 rounded-lg appearance-none cursor-pointer accent-orange-500 outline-none"
          />
          {!isCompact && (
            <span className="text-[10px] text-zinc-500 w-6">
              {Math.round(opacity * 100)}%
            </span>
          )}
        </div>

        {/* Window Controls */}
        {isCompact ? (
          <div className="relative h-full">
            <button
              onClick={toggleMenu}
              className="h-full px-4 flex items-center bg-transparent transition-colors cursor-pointer group outline-none"
            >
              <MenuIcon
                size={16}
                className="text-zinc-400 group-hover:text-white"
              />
            </button>

            {/* Dropdown Menu */}
            {isMenuOpen && (
              <>
                <div
                  className="fixed inset-0 z-40"
                  onClick={() => setIsMenuOpen(false)}
                />
                <div className="absolute right-2 top-full mt-1 bg-zinc-800 rounded-md shadow-lg  z-50 border border-zinc-700">
                  <div
                    onClick={() => {
                      window.electron.windowControls("minimize");
                      setIsMenuOpen(false);
                    }}
                    className="px-4 py-2 flex items-center gap-2 hover:bg-zinc-700 cursor-pointer text-zinc-300 hover:text-white"
                  >
                    <Minus size={14} />
                  </div>
                  <div
                    onClick={() => {
                      window.electron.windowControls("maximize");
                      setIsMenuOpen(false);
                    }}
                    className="px-4 py-2 flex items-center gap-2 hover:bg-zinc-700 cursor-pointer text-zinc-300 hover:text-white"
                  >
                    <Square size={14} />
                  </div>
                  <div
                    onClick={() => {
                      window.electron.windowControls("close");
                      setIsMenuOpen(false);
                    }}
                    className="px-4 py-2 flex items-center gap-2 hover:bg-red-500/20 cursor-pointer text-red-400 hover:text-red-300"
                  >
                    <X size={14} />
                  </div>
                </div>
              </>
            )}
          </div>
        ) : (
          <>
            <div
              onClick={() => window.electron.windowControls("minimize")}
              className="h-full px-4 flex items-center hover:bg-zinc-800 transition-colors cursor-pointer group"
            >
              <Minus
                size={16}
                className="text-zinc-400 group-hover:text-white"
              />
            </div>
            <div
              onClick={() => window.electron.windowControls("maximize")}
              className="h-full px-4 flex items-center hover:bg-zinc-800 transition-colors cursor-pointer group"
            >
              <Square
                size={12}
                className="text-zinc-400 group-hover:text-white"
              />
            </div>
            <div
              onClick={() => window.electron.windowControls("close")}
              className="h-full px-4 flex items-center hover:bg-red-500/80 transition-colors cursor-pointer group"
            >
              <X size={16} className="text-zinc-400 group-hover:text-white" />
            </div>
          </>
        )}
      </div>
    </div>
  );
};
