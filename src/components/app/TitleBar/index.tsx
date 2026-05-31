import React, { useState } from "react";
import {
  Minus,
  Square,
  X,
  SunDim,
  Gauge,
  Play,
  Pause,
  Menu as MenuIcon,
  Settings as SettingsIcon,
} from "lucide-react";
import { IconButton } from "../../common/IconButton";
import { useSpeedStore } from "../../../store/useSpeedStore";

interface TitleBarProps {
  onSettingsClick: () => void;
}

const SPEED_PRESETS = [4, 8, 16, 32, 64] as const;

const isEditableTarget = (target: EventTarget | null) => {
  if (!(target instanceof HTMLElement)) {
    return false;
  }

  const tagName = target.tagName.toLowerCase();
  return (
    tagName === "input" ||
    tagName === "textarea" ||
    tagName === "select" ||
    target.isContentEditable
  );
};

export const TitleBar: React.FC<TitleBarProps> = ({ onSettingsClick }) => {
  const dragStyle: React.CSSProperties & { WebkitAppRegion: "drag" } = {
    WebkitAppRegion: "drag",
  };
  const noDragStyle: React.CSSProperties & { WebkitAppRegion: "no-drag" } = {
    WebkitAppRegion: "no-drag",
  };
  const [opacity, setOpacity] = useState(1);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [selectedSpeed, setSelectedSpeed] = useState("4");
  const [customSpeedInput, setCustomSpeedInput] = useState("");
  const isCustomEditingRef = React.useRef(false);

  const {
    active: isSpeedActive,
    speed,
    pendingMultiplier,
    isLoading: isSpeedLoading,
    statusMessage: speedMessage,
    setPendingMultiplier,
    applyPendingSpeed,
    resetToOriginalSpeed,
  } = useSpeedStore();

  React.useEffect(() => {
    useSpeedStore.getState().fetchStatus();
  }, []);

  React.useEffect(() => {
    if (isCustomEditingRef.current) {
      return;
    }

    const matchingPreset = SPEED_PRESETS.find(
      (preset) => preset === pendingMultiplier,
    );
    if (matchingPreset) {
      setSelectedSpeed(String(matchingPreset));
      return;
    }

    setSelectedSpeed("custom");
    setCustomSpeedInput(String(pendingMultiplier));
  }, [pendingMultiplier]);

  React.useEffect(() => {
    const unsubscribe = window.electron?.speed?.onShortcut?.((key) => {
      if (key === "F1") {
        void applyPendingSpeed();
      } else {
        void resetToOriginalSpeed();
      }
    });

    const handleKeyDown = (event: KeyboardEvent) => {
      if (isEditableTarget(event.target)) {
        return;
      }

      if (event.key.toLowerCase() === "y") {
        event.preventDefault();
        void applyPendingSpeed();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      unsubscribe?.();
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [applyPendingSpeed, resetToOriginalSpeed]);

  const handleOpacityChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value);
    setOpacity(val);
    window.electron.setOpacity(val);
  };

  const toggleMenu = () => {
    setIsMenuOpen(!isMenuOpen);
  };

  const handleSpeedSelect = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const value = e.target.value;
    setSelectedSpeed(value);

    if (value === "custom") {
      isCustomEditingRef.current = true;
      setCustomSpeedInput("");
      return;
    }

    isCustomEditingRef.current = false;
    setPendingMultiplier(Number(value));
  };

  const handleCustomSpeedChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    if (value !== "" && !/^\d*\.?\d*$/.test(value)) {
      return;
    }

    setCustomSpeedInput(value);
    const multiplier = Number(value);
    if (Number.isFinite(multiplier) && multiplier > 0) {
      setPendingMultiplier(multiplier);
    }
  };

  const isOriginalSpeed = Math.abs(speed - 1) < 0.001;

  return (
    <div
      className="h-gr-5 flex items-center justify-between select-none relative z-50 px-gr-3"
      style={dragStyle}
    >
      <div className="absolute inset-0 glass -z-10" />
      <div className="flex items-center gap-gr-3 min-w-0">
        <div className="w-gr-4 h-gr-4 premium-gradient rounded-gr-2 flex items-center justify-center flex-shrink-0 shadow-lg shadow-primary/20">
          <span className="text-white text-[10px] font-bold">F</span>
        </div>

        <div
          className="flex items-center gap-gr-1 px-gr-1 py-0.5 bg-white/5 rounded-full border border-white/10 no-drag ml-gr-2 shadow-sm"
          style={noDragStyle}
        >
          <div
            className={`p-1 rounded-full transition-colors ${
              isSpeedActive
                ? "text-primary bg-primary/10"
                : "text-zinc-500 bg-white/5"
            }`}
          >
            <Gauge size={12} className={isSpeedActive ? "animate-pulse" : ""} />
          </div>

          <select
            value={selectedSpeed}
            onChange={handleSpeedSelect}
            className="h-5 appearance-none rounded border border-white/10 bg-zinc-900/80 px-2 text-[10px] font-bold text-zinc-100 outline-none transition-colors hover:bg-zinc-800"
            title="待生效倍速"
          >
            {SPEED_PRESETS.map((preset) => (
              <option
                key={preset}
                value={preset}
                className="bg-zinc-800 text-zinc-100"
              >
                {preset}x
              </option>
            ))}
            <option value="custom" className="bg-zinc-800 text-zinc-100">
              自定义
            </option>
          </select>

          {selectedSpeed === "custom" && (
            <input
              type="text"
              inputMode="decimal"
              value={customSpeedInput}
              onChange={handleCustomSpeedChange}
              className="h-5 w-14 rounded border border-white/10 bg-zinc-900/80 px-1.5 text-center text-[10px] font-bold text-zinc-100 placeholder:text-zinc-500 outline-none transition-colors focus:border-primary/50"
              placeholder="请输入"
              title="自定义待生效倍速"
            />
          )}

          <button
            onClick={() =>
              void (isOriginalSpeed
                ? applyPendingSpeed()
                : resetToOriginalSpeed())
            }
            disabled={isSpeedLoading}
            className={`h-5 w-5 inline-flex items-center justify-center rounded-full transition-colors disabled:opacity-50 ${
              !isOriginalSpeed
                ? "bg-red-500/15 text-red-300 hover:bg-red-500/25"
                : "bg-emerald-500/15 text-emerald-300 hover:bg-emerald-500/25"
            }`}
            title={isOriginalSpeed ? "启用变速" : "切回原速"}
          >
            {!isOriginalSpeed ? (
              <Pause size={10} fill="currentColor" />
            ) : (
              <Play size={10} fill="currentColor" />
            )}
          </button>

          <span className="whitespace-nowrap px-1 text-[10px] font-bold text-zinc-400">
            {isOriginalSpeed
              ? "处于原速 ,按F1变速"
              : "处于变速 ,按F2切原速"}
          </span>

          {speedMessage && (
            <div className="absolute top-full left-1/2 -translate-x-1/2 mt-1 px-2 py-0.5 bg-zinc-900 border border-border rounded text-[9px] font-bold text-primary whitespace-nowrap shadow-xl z-[60] animate-in fade-in zoom-in duration-200">
              {speedMessage}
            </div>
          )}
        </div>
      </div>

      <div className="flex items-center h-full no-drag" style={noDragStyle}>
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
