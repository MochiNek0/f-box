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
import { SpeedControl } from "../SpeedControl";

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
      className="h-10 min-h-10 flex items-center justify-between select-none relative z-50 px-2 border-b border-white/5"
      style={dragStyle}
    >
      <div className="absolute inset-0 glass -z-10" />
      <div className="flex flex-1 items-center gap-2 min-w-0">
        <div className="w-7 h-7 premium-gradient rounded-gr-2 flex items-center justify-center flex-shrink-0 shadow-lg shadow-primary/20">
          <span className="text-white text-[10px] font-bold">F</span>
        </div>

        <div
          className="no-drag ml-1 flex min-w-0 items-center"
          style={noDragStyle}
        >
          <SpeedControl />
        </div>
      </div>

      <div className="flex h-full flex-shrink-0 items-center gap-1 no-drag" style={noDragStyle}>
        <div className="hidden sm:flex h-8 items-center gap-2 px-2">
          <SunDim size={14} className="text-zinc-500" />
          <input
            type="range"
            min="0.15"
            max="1"
            step="0.05"
            value={opacity}
            onChange={handleOpacityChange}
            className="w-24 premium-slider cursor-pointer outline-none transition-all lg:w-gr-7"
          />
          <span className="hidden lg:inline-block text-[10px] text-zinc-500 w-gr-3 text-center font-mono">
            {Math.round(opacity * 100)}%
          </span>
        </div>

        <IconButton
          icon={<SettingsIcon size={16} />}
          onClick={onSettingsClick}
        />

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
          className="max-md:hidden h-full w-10 rounded-none hover:bg-white/10"
          icon={<Minus size={16} />}
          onClick={() => window.electron.windowControls("minimize")}
        />
        <IconButton
          className="max-md:hidden h-full w-10 rounded-none hover:bg-white/10"
          icon={<Square size={12} />}
          onClick={() => window.electron.windowControls("maximize")}
        />
        <IconButton
          className="max-md:hidden h-full w-10 rounded-none hover:bg-red-500 hover:text-white"
          icon={<X size={16} />}
          onClick={() => window.electron.windowControls("close")}
        />
      </div>
    </div>
  );
};
