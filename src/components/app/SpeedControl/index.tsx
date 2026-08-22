// Speed-gear controls (preset picker + apply/reset). Extracted from TitleBar so
// the fullscreen game toolbar can show them too — in fullscreen the title bar is
// unmounted, which would otherwise leave no way to change speed without leaving
// fullscreen first.
//
// The listeners that must survive regardless of which UI is mounted (F1/F2, the
// watchdog state pushes) live in useSpeedStore's initSpeedListeners, not here.
import React, { useState } from "react";
import { Gauge, Play, Pause } from "lucide-react";
import { IconButton } from "../../common/IconButton";
import { useSpeedStore } from "../../../store/useSpeedStore";

// Capped at 128x — higher multipliers frequently crash the Flash plugin (see
// useSpeedStore MAX_SAFE_SPEED).
const SPEED_PRESETS = [4, 8, 16, 32, 64, 128] as const;

interface SpeedControlProps {
  // Extra classes for the wrapper, so callers can add their own spacing (the
  // title bar needs the frameless-window no-drag treatment, for instance).
  className?: string;
  // The title bar has room for the "按F1变速" reminder; the game toolbar does
  // not.
  showHint?: boolean;
}

export const SpeedControl: React.FC<SpeedControlProps> = ({
  className = "",
  showHint = true,
}) => {
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
      className={`relative flex min-w-0 items-center gap-1 px-1 py-1 ${className}`}
    >
      <div
        className={`h-6 w-6 inline-flex items-center justify-center rounded-gr-2 transition-colors ${
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
        className="h-6 min-w-[68px] appearance-none rounded-gr-2 border border-white/10 bg-zinc-900/80 px-2 text-[10px] font-bold text-zinc-100 outline-none transition-colors hover:bg-zinc-800 focus:border-primary/50"
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
          className="h-6 w-16 rounded-gr-2 border border-white/10 bg-zinc-900/80 px-1.5 text-center text-[10px] font-bold text-zinc-100 placeholder:text-zinc-500 outline-none transition-colors focus:border-primary/50"
          placeholder="请输入"
          title="自定义待生效倍速"
        />
      )}

      <IconButton
        icon={
          !isOriginalSpeed ? (
            <Pause size={10} fill="currentColor" />
          ) : (
            <Play size={10} fill="currentColor" />
          )
        }
        onClick={() =>
          void (isOriginalSpeed ? applyPendingSpeed() : resetToOriginalSpeed())
        }
        disabled={isSpeedLoading}
        size="sm"
        className={`h-6 w-6 inline-flex items-center justify-center rounded-gr-2 transition-colors outline-none disabled:opacity-50 ${
          !isOriginalSpeed
            ? "bg-red-500/15 text-red-300 hover:bg-red-500/25"
            : "bg-emerald-500/15 text-emerald-300 hover:bg-emerald-500/25"
        }`}
        title={isOriginalSpeed ? "启用变速" : "切回原速"}
      />

      {showHint && (
        <span className="hidden xl:inline-flex max-w-[220px] truncate whitespace-nowrap px-1 text-[10px] font-bold text-zinc-400">
          {isOriginalSpeed ? "处于原速 ,按F1变速" : "处于变速 ,按F2切原速"}
        </span>
      )}

      {speedMessage && (
        <div className="absolute top-full left-1/2 -translate-x-1/2 mt-1 px-2 py-0.5 bg-zinc-900 border border-border rounded text-[9px] font-bold text-primary whitespace-nowrap shadow-xl z-[60] animate-in fade-in zoom-in duration-200">
          {speedMessage}
        </div>
      )}
    </div>
  );
};
