import React, { useState, useEffect } from "react";
import { Gauge, Play, Square, RotateCcw } from "lucide-react";
import { Button } from "../../../common/Button";

const isWindows = () => window.electron.getPlatform() === "win32";

const SPEED_PRESETS = [
  { label: "0.25x", value: 0.25 },
  { label: "0.5x", value: 0.5 },
  { label: "1x", value: 1.0 },
  { label: "2x", value: 2.0 },
  { label: "5x", value: 5.0 },
  { label: "10x", value: 10.0 },
  { label: "100x", value: 100.0 },
];

export const SpeedTab: React.FC = () => {
  const [isPlatformSupported, setIsPlatformSupported] = useState(true);
  const [isActive, setIsActive] = useState(false);
  const [speed, setSpeed] = useState(1.0);
  const [customSpeed, setCustomSpeed] = useState("1.0");
  const [statusMessage, setStatusMessage] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    setIsPlatformSupported(isWindows());
  }, []);

  // Poll status on mount
  useEffect(() => {
    window.electron.speed.getStatus().then((status) => {
      setIsActive(status.active);
      setSpeed(status.speed);
      setCustomSpeed(status.speed.toString());
    });
  }, []);

  if (!isPlatformSupported) {
    return (
      <div className="space-y-gr-4">
        <section className="glass p-gr-4 rounded-gr-4">
          <div className="flex flex-col items-center justify-center py-gr-5 text-center">
            <div className="w-16 h-16 rounded-full bg-white/5 flex items-center justify-center mb-gr-3">
              <Gauge size={32} className="text-zinc-500" />
            </div>
            <h3 className="text-lg font-black text-foreground mb-gr-1 uppercase tracking-tighter">
              此功能仅支持 Windows
            </h3>
            <p className="text-sm text-zinc-500 max-w-md font-medium">
              变速齿轮功能依赖 DLL
              注入技术，目前仅在 Windows 平台上可用。
            </p>
          </div>
        </section>
      </div>
    );
  }

  const handleStart = async () => {
    setIsLoading(true);
    setStatusMessage("正在注入变速齿轮...");

    const result = await window.electron.speed.start();
    if (result.success) {
      setIsActive(true);
      setStatusMessage("✅ 变速齿轮已启动");
      // Apply current speed
      await window.electron.speed.setSpeed(speed);
    } else {
      setStatusMessage(`❌ ${result.error || "启动失败"}`);
    }
    setIsLoading(false);
    setTimeout(() => setStatusMessage(""), 4000);
  };

  const handleStop = async () => {
    setIsLoading(true);
    setStatusMessage("正在停止变速...");

    await window.electron.speed.stop();
    setIsActive(false);
    setSpeed(1.0);
    setCustomSpeed("1.0");
    setStatusMessage("⏹️ 变速齿轮已停止");
    setIsLoading(false);
    setTimeout(() => setStatusMessage(""), 3000);
  };

  const handleSetSpeed = async (newSpeed: number) => {
    setSpeed(newSpeed);
    setCustomSpeed(newSpeed.toString());
    if (isActive) {
      const result = await window.electron.speed.setSpeed(newSpeed);
      if (result.success) {
        setStatusMessage(`⚡ 速度已设置为 ${newSpeed}x`);
      } else {
        setStatusMessage(`❌ ${result.error}`);
      }
      setTimeout(() => setStatusMessage(""), 2000);
    }
  };

  const handleCustomSpeedSubmit = async () => {
    const val = parseFloat(customSpeed);
    if (isNaN(val) || val <= 0) {
      setStatusMessage("❌ 请输入有效的速度值");
      setTimeout(() => setStatusMessage(""), 2000);
      return;
    }
    await handleSetSpeed(val);
  };

  const handleReset = async () => {
    await handleSetSpeed(1.0);
  };

  return (
    <div className="space-y-gr-4">
      {/* Speed Presets */}
      <section className="glass p-gr-4 rounded-gr-4">
        <label className="block text-[10px] font-black text-zinc-500 uppercase tracking-widest mb-gr-3">
          速度预设
        </label>

        <div className="grid grid-cols-7 gap-gr-2">
          {SPEED_PRESETS.map((preset) => (
            <button
              key={preset.value}
              onClick={() => handleSetSpeed(preset.value)}
              disabled={isLoading}
              className={`h-10 rounded-gr-2 text-sm font-black uppercase tracking-tighter transition-all border disabled:opacity-50 ${
                speed === preset.value
                  ? "bg-primary/20 border-primary text-primary shadow-[0_0_15px_rgba(var(--primary),0.15)]"
                  : "bg-white/5 border-white/10 text-zinc-400 hover:border-primary/50 hover:text-zinc-200"
              }`}
            >
              {preset.label}
            </button>
          ))}
        </div>

        {/* Custom Speed Input */}
        <div className="flex items-center gap-gr-3 mt-gr-3">
          <span className="text-[10px] text-zinc-500 font-black uppercase tracking-tighter">
            自定义倍速
          </span>
          <div className="flex items-center gap-gr-2">
            <input
              type="number"
              min="0.01"
              max="999"
              step="0.1"
              value={customSpeed}
              onChange={(e) => setCustomSpeed(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleCustomSpeedSubmit();
              }}
              disabled={isLoading}
              className="w-24 bg-white/5 border border-border rounded-gr-2 px-gr-3 py-gr-2 text-sm text-zinc-200 font-mono focus:outline-none focus:border-primary transition-all disabled:opacity-50 font-black"
            />
            <span className="text-[10px] text-zinc-500 font-black">x</span>
            <Button
              onClick={handleCustomSpeedSubmit}
              variant="secondary"
              disabled={isLoading}
              className="h-8 px-gr-3 py-1 text-[10px] font-black uppercase tracking-tighter"
            >
              应用
            </Button>
          </div>
        </div>
      </section>

      {/* Speed Visualization */}
      <section className="glass p-gr-4 rounded-gr-4">
        <label className="block text-[10px] font-black text-zinc-500 uppercase tracking-widest mb-gr-3">
          当前速度
        </label>
        <div className="flex items-center gap-gr-4">
          <div className="flex-1">
            {/* Speed bar */}
            <div className="relative h-3 bg-white/5 rounded-full overflow-hidden">
              <div
                className="absolute inset-y-0 left-0 rounded-full transition-all duration-300 ease-out"
                style={{
                  width: `${Math.min((Math.log2(speed) + 2) / 5.32 * 100, 100)}%`,
                  background:
                    speed < 1
                      ? "linear-gradient(90deg, #3b82f6, #60a5fa)"
                      : speed === 1
                        ? "linear-gradient(90deg, #22c55e, #4ade80)"
                        : speed <= 5
                          ? "linear-gradient(90deg, #f59e0b, #fbbf24)"
                          : "linear-gradient(90deg, #ef4444, #f87171)",
                }}
              />
            </div>
          </div>
          <div className="flex items-baseline gap-1 min-w-[80px] justify-end">
            <span
              className={`text-2xl font-black tabular-nums tracking-tighter ${
                speed < 1
                  ? "text-blue-400"
                  : speed === 1
                    ? "text-green-400"
                    : speed <= 5
                      ? "text-amber-400"
                      : "text-red-400"
              }`}
            >
              {speed}
            </span>
            <span className="text-[10px] text-zinc-500 font-black uppercase">
              x
            </span>
          </div>
        </div>
      </section>

      {/* Controls */}
      <section className="glass p-gr-4 rounded-gr-4">
        <label className="block text-[10px] font-black text-zinc-500 uppercase tracking-widest mb-gr-3">
          运行控制
        </label>

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-gr-3">
            {!isActive ? (
              <Button
                onClick={handleStart}
                variant="primary"
                className="flex items-center px-gr-4"
                disabled={isLoading}
              >
                <Play size={16} className="mr-gr-2" />
                启动变速
              </Button>
            ) : (
              <>
                <Button
                  onClick={handleStop}
                  variant="danger"
                  className="flex items-center px-gr-4"
                  disabled={isLoading}
                >
                  <Square size={16} className="mr-gr-2" />
                  停止变速
                </Button>
                <Button
                  onClick={handleReset}
                  variant="secondary"
                  className="flex items-center px-gr-4"
                  disabled={isLoading}
                >
                  <RotateCcw size={16} className="mr-gr-2" />
                  重置 (1x)
                </Button>
              </>
            )}
          </div>

          <div className="text-sm text-zinc-400">
            {statusMessage && (
              <span className="flex items-center gap-gr-2 uppercase tracking-tighter font-black text-[10px]">
                {isActive && !statusMessage.startsWith("❌") && !statusMessage.startsWith("⏹") && (
                  <span className="w-2 h-2 rounded-full bg-primary animate-pulse shadow-[0_0_8px_rgba(var(--primary),0.5)]" />
                )}
                {statusMessage}
              </span>
            )}
            {isActive && !statusMessage && (
              <span className="flex items-center gap-gr-2 uppercase tracking-tighter font-black text-[10px] text-green-400">
                <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse shadow-[0_0_8px_rgba(34,197,94,0.5)]" />
                变速已启用
              </span>
            )}
          </div>
        </div>
      </section>

      {/* Usage Tips */}
      <div className="glass p-gr-3 rounded-gr-3 border border-white/5">
        <p className="text-[10px] text-zinc-500 leading-relaxed font-medium">
          <span className="text-zinc-400 font-black uppercase tracking-widest mr-gr-1">
            提示：
          </span>{" "}
          变速齿轮通过 Hook Windows 计时 API 来改变游戏时间流速。
          <span className="text-primary font-bold">启动前请先加载 Flash 游戏</span>。
          如果切换了游戏页面，需要重新启动变速。杀毒软件可能会拦截 DLL 注入，请将应用目录加入白名单。
        </p>
      </div>
    </div>
  );
};
