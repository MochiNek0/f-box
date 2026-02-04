import React, { useState } from "react";
import {
  Minus,
  Square,
  X,
  SunDim,
  Menu as MenuIcon,
  Settings as SettingsIcon,
} from "lucide-react";
import { IconButton } from "../../common/IconButton";

interface TitleBarProps {
  onSettingsClick: () => void;
}

export const TitleBar: React.FC<TitleBarProps> = ({ onSettingsClick }) => {
  const [opacity, setOpacity] = useState(1);
  const [isMenuOpen, setIsMenuOpen] = useState(false);

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
      className="h-10 bg-zinc-900 flex items-center justify-between select-none relative px-2"
      style={{ WebkitAppRegion: "drag" } as any}
    >
      <div className="flex items-center gap-2">
        <div className="w-5 h-5 bg-orange-500 rounded flex items-center justify-center flex-shrink-0">
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
          <span className="text-[10px] text-zinc-500 w-6 max-md:hidden">
            {Math.round(opacity * 100)}%
          </span>
        </div>

        {/* Settings Button */}
        <IconButton
          icon={<SettingsIcon size={16} />}
          onClick={onSettingsClick}
        />

        {/* Window Controls */}

        <div className="relative flex items-center h-full md:hidden">
          <IconButton icon={<MenuIcon size={16} />} onClick={toggleMenu} />

          {isMenuOpen && (
            <>
              <div
                className="fixed inset-0 z-40"
                onClick={() => setIsMenuOpen(false)}
              />
              <div className="absolute right-1 top-full mt-1 bg-zinc-800 rounded-md shadow-lg z-50 border border-zinc-700">
                <IconButton
                  className="w-full hover:bg-zinc-500 rounded-none rounded-t-md"
                  icon={<Minus size={14} />}
                  onClick={() => {
                    window.electron.windowControls("minimize");
                    setIsMenuOpen(false);
                  }}
                />

                <IconButton
                  className="w-full hover:bg-zinc-500 rounded-none"
                  icon={<Square size={12} />}
                  onClick={() => {
                    window.electron.windowControls("maximize");
                    setIsMenuOpen(false);
                  }}
                />

                <IconButton
                  icon={<X size={14} />}
                  variant="danger"
                  className="w-full rounded-none rounded-b-md"
                  onClick={() => {
                    window.electron.windowControls("close");
                    setIsMenuOpen(false);
                  }}
                />
              </div>
            </>
          )}
        </div>

        <IconButton
          className="max-md:hidden"
          icon={<Minus size={16} />}
          onClick={() => window.electron.windowControls("minimize")}
        />
        <IconButton
          className="max-md:hidden"
          icon={<Square size={12} />}
          onClick={() => window.electron.windowControls("maximize")}
        />
        <IconButton
          className="max-md:hidden"
          icon={<X size={16} />}
          onClick={() => window.electron.windowControls("close")}
        />
      </div>
    </div>
  );
};
