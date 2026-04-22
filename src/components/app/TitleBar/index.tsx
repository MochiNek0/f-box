import React, { useState } from "react";
import {
  Minus,
  Square,
  X,
  SunDim,
  Gauge,
  Play,
  Square as SquareIcon,
  Menu as MenuIcon,
  Settings as SettingsIcon,
} from "lucide-react";
import { IconButton } from "../../common/IconButton";
import { useSpeedStore } from "../../../store/useSpeedStore";

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
  const [speedInput, setSpeedInput] = useState("");
  const speedInputTimer = React.useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );

  const {
    active: isSpeedActive,
    speed,
    isLoading: isSpeedLoading,
    statusMessage: speedMessage,
    startSpeed,
    stopSpeed,
    setSpeed,
  } = useSpeedStore();

  React.useEffect(() => {
    useSpeedStore.getState().fetchStatus();
  }, []);

  // Sync local input when speed changes externally (e.g., preset selection)
  React.useEffect(() => {
    setSpeedInput(speed > 0 ? speed.toString() : "");
  }, [speed]);

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
      <div className="flex items-center gap-gr-3">
        <div className="w-gr-4 h-gr-4 premium-gradient rounded-gr-2 flex items-center justify-center flex-shrink-0 shadow-lg shadow-primary/20">
          <span className="text-white text-[10px] font-bold">F</span>
        </div>

        <div
          className="flex items-center gap-gr-1 px-gr-1 py-0.5 bg-white/5 rounded-full border border-white/10 no-drag ml-gr-2 shadow-sm"
          style={noDragStyle}
        >
          {/* Status Icon */}
          <div
            className={`p-1 rounded-full transition-colors ${isSpeedActive ? "text-primary bg-primary/10" : "text-zinc-500 bg-white/5"}`}
          >
            <Gauge size={12} className={isSpeedActive ? "animate-pulse" : ""} />
          </div>

          {/* Custom Multiplier Input (自动调节/自定义倍数) */}
          <div className="flex items-center bg-zinc-900/50 rounded-md px-1 py-0.5 border border-white/5 focus-within:border-primary/50 transition-all">
            <input
              type="text"
              value={speedInput}
              onChange={(e) => {
                const val = e.target.value;
                if (val === "" || /^[0-9]*\.?[0-9]*$/.test(val)) {
                  setSpeedInput(val);
                  if (speedInputTimer.current)
                    clearTimeout(speedInputTimer.current);
                  speedInputTimer.current = setTimeout(() => {
                    const num = parseFloat(val);
                    if (!isNaN(num) && num > 0) setSpeed(num);
                  }, 300);
                }
              }}
              onBlur={() => {
                if (speedInputTimer.current)
                  clearTimeout(speedInputTimer.current);
                const num = parseFloat(speedInput);
                if (!isNaN(num) && num > 0) setSpeed(num);
              }}
              className="w-10 bg-transparent text-[9px] font-black tabular-nums text-center text-zinc-100 placeholder-zinc-600 border-none outline-none p-0"
              placeholder="1.0"
            />
            <span className="text-[7.5px] font-black text-zinc-500 ml-0.5">
              X
            </span>
          </div>

          {/* Gears Dropdown (挡位下拉框) */}
          <div className="relative flex items-center h-4">
            <select
              value={
                Math.abs(speed - Math.round(speed)) < 0.01
                  ? Math.round(speed)
                  : ""
              }
              onChange={(e) => setSpeed(parseFloat(e.target.value))}
              className="appearance-none bg-white/5 hover:bg-white/10 text-zinc-400 hover:text-zinc-200 text-[8.5px] font-black px-1.5 py-0.5 rounded border border-white/5 outline-none cursor-pointer transition-all"
            >
              <option value="" disabled hidden>
                ·
              </option>
              <option value="1" className="bg-zinc-800 text-zinc-200">
                1x
              </option>
              <option value="2" className="bg-zinc-800 text-zinc-200">
                2x
              </option>
              <option value="5" className="bg-zinc-800 text-zinc-200">
                5x
              </option>
              <option value="10" className="bg-zinc-800 text-zinc-200">
                10x
              </option>
              <option value="100" className="bg-zinc-800 text-zinc-200">
                100x
              </option>
            </select>
          </div>

          {/* Toggle Button */}
          <button
            onClick={() => (isSpeedActive ? stopSpeed() : startSpeed())}
            disabled={isSpeedLoading}
            className={`p-1 rounded-full transition-all group ${
              isSpeedActive
                ? "bg-red-500/10 text-red-400 hover:bg-red-500/20"
                : "bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20"
            } disabled:opacity-50`}
            title={isSpeedActive ? "停止变速" : "开启变速"}
          >
            {isSpeedActive ? (
              <SquareIcon size={10} fill="currentColor" />
            ) : (
              <Play
                size={10}
                fill="currentColor"
                className="translate-x-[0.5px]"
              />
            )}
          </button>

          {/* Feedback Message (Optional/Compact) */}
          {speedMessage && (
            <div className="absolute top-full left-1/2 -translate-x-1/2 mt-1 px-2 py-0.5 bg-zinc-900 border border-border rounded text-[9px] font-bold text-primary whitespace-nowrap shadow-xl z-[60] animate-in fade-in zoom-in duration-200">
              {speedMessage.replace(/^[✅⏹⚡❌]\s*/, "")}
            </div>
          )}
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
