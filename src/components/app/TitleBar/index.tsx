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
  const dragStyle: React.CSSProperties & { WebkitAppRegion: "drag" } = {
    WebkitAppRegion: "drag",
  };
  const noDragStyle: React.CSSProperties & { WebkitAppRegion: "no-drag" } = {
    WebkitAppRegion: "no-drag",
  };
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
      className="h-gr-5 flex items-center justify-between select-none relative z-50 px-gr-3"
      style={dragStyle}
    >
      <div className="absolute inset-0 glass -z-10" />
      <div className="flex items-center gap-gr-2">
        <div className="w-gr-4 h-gr-4 premium-gradient rounded-gr-2 flex items-center justify-center flex-shrink-0 shadow-lg shadow-primary/20">
          <span className="text-white text-[10px] font-bold">F</span>
        </div>
      </div>

      <div className="flex items-center h-full no-drag" style={noDragStyle}>
        {/* Opacity Slider */}
        <div className="flex items-center gap-gr-3 px-gr-4 border-r border-border h-gr-4">
          <SunDim size={14} className="text-zinc-500" />
          <input
            type="range"
            min="0.15"
            max="1"
            step="0.05"
            value={opacity}
            onChange={handleOpacityChange}
            className="w-gr-7 premium-slider cursor-pointer outline-none transition-all"
          />
          <span className="text-[10px] text-zinc-500 w-gr-3 max-md:hidden text-center font-mono">
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
                className="fixed inset-0 z-40 bg-black/40 backdrop-blur-[2px]"
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
          className="max-md:hidden hover:bg-white/10"
          icon={<Minus size={16} />}
          onClick={() => window.electron.windowControls("minimize")}
        />
        <IconButton
          className="max-md:hidden hover:bg-white/10"
          icon={<Square size={12} />}
          onClick={() => window.electron.windowControls("maximize")}
        />
        <IconButton
          className="max-md:hidden hover:bg-red-500 hover:text-white"
          icon={<X size={16} />}
          onClick={() => window.electron.windowControls("close")}
        />
      </div>
    </div>
  );
};
