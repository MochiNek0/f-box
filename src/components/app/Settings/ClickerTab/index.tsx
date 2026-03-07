import React, { useState, useEffect } from "react";
import {
  Play,
  Square,
  Plus,
  Trash2,
  ArrowUp,
  ArrowDown,
  Save,
} from "lucide-react";
import { Button } from "../../../common/Button";
import { IconButton } from "../../../common/IconButton";

export interface ClickerStep {
  id: string;
  key: string;
  intervalMs: number;
}

interface AutomationKeyEvent {
  t: number;
  type: "keydown" | "keyup";
  key: string;
}

const createStepId = (): string => {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  return `step-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
};

const createStep = (): ClickerStep => ({
  id: createStepId(),
  key: "S",
  intervalMs: 100,
});

export const ClickerTab: React.FC = () => {
  const [steps, setSteps] = useState<ClickerStep[]>([{ id: "step-1", key: "S", intervalMs: 100 }]);
  const [loopCount, setLoopCount] = useState<number>(0); // 0 = infinite
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [statusMessage, setStatusMessage] = useState<string>("");

  useEffect(() => {
    // Load config on mount
    window.electron.automation.getConfig("_clicker_temp").then((config) => {
      if (config) {
        if (config.steps) setSteps(config.steps);
        if (config.repeatCount !== undefined) setLoopCount(config.repeatCount);
      }
    });

    const detachStatus = window.electron.automation.onStatus((status: string) => {
      const parts = status.split("|");
      if (parts[0] === "STATUS") {
        const action = parts[1];
        if (action === "PLAYING") setStatusMessage("▶️ 正在运行连点器...");
        if (
          action === "STOPPED" ||
          action === "PROCESS_EXIT" ||
          action === "MAX_LOOPS_REACHED"
        ) {
          setIsPlaying(false);
          setStatusMessage("⏹️ 连点器已停止");
        }
      }
    });

    return () => {
      detachStatus();
    };
  }, []);

  const handleAddStep = () => {
    setSteps((prev) => [...prev, createStep()]);
  };

  const handleRemoveStep = (id: string) => {
    setSteps(steps.filter((s) => s.id !== id));
  };

  const handleUpdateStep = (
    id: string,
    field: "key" | "intervalMs",
    value: string | number,
  ) => {
    setSteps(
      steps.map((s) => {
        if (s.id === id) {
          return { ...s, [field]: value };
        }
        return s;
      }),
    );
  };

  const handleMoveStep = (index: number, direction: "up" | "down") => {
    if (direction === "up" && index > 0) {
      const newSteps = [...steps];
      [newSteps[index - 1], newSteps[index]] = [
        newSteps[index],
        newSteps[index - 1],
      ];
      setSteps(newSteps);
    } else if (direction === "down" && index < steps.length - 1) {
      const newSteps = [...steps];
      [newSteps[index + 1], newSteps[index]] = [
        newSteps[index],
        newSteps[index + 1],
      ];
      setSteps(newSteps);
    }
  };

  const handleSaveConfig = async () => {
    setStatusMessage("正在保存配置...");
    let currentT = 0;
    const events: AutomationKeyEvent[] = [];
    for (const step of steps) {
      const upperKey = step.key.toUpperCase();
      currentT += step.intervalMs;
      events.push({ t: currentT, type: "keydown", key: upperKey });
      currentT += 10;
      events.push({ t: currentT, type: "keyup", key: upperKey });
    }
    await window.electron.automation.saveScript("_clicker_temp", events);
    await window.electron.automation.saveConfig("_clicker_temp", {
      repeatCount: loopCount,
      steps: steps,
    });
    setStatusMessage("✅ 配置已保存");
    setTimeout(() => {
      setStatusMessage("");
    }, 2000);
  };

  const generateEventsAndPlay = async () => {
    if (steps.length === 0) {
      setStatusMessage("❌ 请至少添加一个按键");
      return;
    }

    setIsPlaying(true);
    setStatusMessage("正在启动连点器...");

    // Generate events Array for AHK Automation Script
    let currentT = 0;
    const events: AutomationKeyEvent[] = [];

    for (const step of steps) {
      const upperKey = step.key.toUpperCase();

      // Delay before keydown
      currentT += step.intervalMs;

      events.push({
        t: currentT,
        type: "keydown",
        key: upperKey,
      });

      // Quick keyup (e.g. 10ms later)
      currentT += 10;
      events.push({
        t: currentT,
        type: "keyup",
        key: upperKey,
      });
    }

    // Save script
    await window.electron.automation.saveScript("_clicker_temp", events);

    // Save config (for loop count and restoring UI state)
    await window.electron.automation.saveConfig("_clicker_temp", {
      repeatCount: loopCount,
      steps: steps,
    });

    // Start playback
    await window.electron.automation.startPlay("_clicker_temp");
  };

  const handleStop = async () => {
    await window.electron.automation.stopPlay();
    setIsPlaying(false);
  };

  return (
    <div className="space-y-6">
      <section className="bg-zinc-800/30 p-6 rounded-2xl border border-zinc-800/50">
        <div className="flex justify-between items-center mb-4">
          <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-[0.2em]">
            按键序列设置
          </label>
          <Button
            onClick={handleAddStep}
            variant="secondary"
            disabled={isPlaying}
            className="h-8 px-3 py-1 flex items-center text-xs"
          >
            <Plus size={14} className="mr-1" />
            添加按键
          </Button>
        </div>

        <div className="space-y-3">
          {steps.map((step, index) => (
            <div
              key={step.id}
              className="flex items-center gap-3 bg-zinc-900/50 p-3 rounded-xl border border-zinc-700/50"
            >
              <div className="flex-shrink-0 text-zinc-500 font-mono text-xs w-6 text-center">
                #{index + 1}
              </div>

              <div className="flex-1 flex gap-3 max-md:flex-col">
                <div className="flex-1 flex items-center gap-2">
                  <span className="text-xs text-zinc-400">按键</span>
                  <input
                    type="text"
                    maxLength={1}
                    disabled={isPlaying}
                    value={step.key}
                    onChange={(e) =>
                      handleUpdateStep(step.id, "key", e.target.value)
                    }
                    className="w-16 bg-zinc-800 border-zinc-600 rounded-md px-2 py-1.5 text-center text-sm font-mono text-orange-400 focus:outline-none focus:border-orange-500 uppercase disabled:opacity-50"
                  />
                </div>

                <div className="flex-1 flex items-center gap-2">
                  <span className="text-xs text-zinc-400">延时 (ms)</span>
                  <input
                    type="number"
                    min="0"
                    disabled={isPlaying}
                    value={step.intervalMs}
                    onChange={(e) =>
                      handleUpdateStep(
                        step.id,
                        "intervalMs",
                        parseInt(e.target.value) || 0,
                      )
                    }
                    className="w-24 bg-zinc-800 border-zinc-600 rounded-md px-2 py-1.5 text-sm font-mono text-zinc-200 focus:outline-none focus:border-orange-500 disabled:opacity-50"
                  />
                </div>
              </div>

              <div className="flex items-center gap-1">
                <IconButton
                  icon={<ArrowUp size={14} />}
                  onClick={() => handleMoveStep(index, "up")}
                  disabled={isPlaying || index === 0}
                  title="上移"
                />
                <IconButton
                  icon={<ArrowDown size={14} />}
                  onClick={() => handleMoveStep(index, "down")}
                  disabled={isPlaying || index === steps.length - 1}
                  title="下移"
                />
                <div className="w-px h-4 bg-zinc-700 mx-1"></div>
                <IconButton
                  icon={<Trash2 size={14} />}
                  onClick={() => handleRemoveStep(step.id)}
                  disabled={isPlaying || steps.length <= 1}
                  variant="danger"
                  title="删除"
                />
              </div>
            </div>
          ))}
          {steps.length === 0 && (
            <p className="text-sm text-zinc-600 italic text-center py-4">
              请添加按键
            </p>
          )}
        </div>
      </section>

      <section className="bg-zinc-800/30 p-6 rounded-2xl border border-zinc-800/50">
        <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-[0.2em] mb-4">
          运行设置
        </label>

        <div className="flex items-center gap-4 mb-6">
          <div className="flex-1">
            <label className="text-xs text-zinc-400 block mb-2">
              循环次数 (0 为无限循环)
            </label>
            <input
              type="number"
              min="0"
              value={loopCount}
              onChange={(e) => setLoopCount(parseInt(e.target.value, 10) || 0)}
              disabled={isPlaying}
              className="w-full max-w-[200px] bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-zinc-200 font-mono focus:outline-none focus:border-orange-500 transition-colors disabled:opacity-50"
            />
          </div>
        </div>

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {!isPlaying ? (
              <>
                <Button
                  onClick={generateEventsAndPlay}
                  variant="primary"
                  className="flex items-center px-6"
                  disabled={steps.length === 0}
                >
                  <Play size={16} className="mr-2" />
                  启动连点器
                </Button>
                <Button
                  onClick={handleSaveConfig}
                  variant="secondary"
                  className="flex items-center px-6"
                  disabled={steps.length === 0}
                >
                  <Save size={16} className="mr-2" />
                  保存配置
                </Button>
              </>
            ) : (
              <Button
                onClick={handleStop}
                variant="danger"
                className="flex items-center px-6"
              >
                <Square size={16} className="mr-2" />
                停止运行 (F10)
              </Button>
            )}
          </div>

          <div className="text-sm text-zinc-400">
            {statusMessage && (
              <span className="flex items-center gap-2">
                {isPlaying && (
                  <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span>
                )}
                {statusMessage}
              </span>
            )}
          </div>
        </div>
      </section>

      {/* Usage Tips */}
      <div className="bg-zinc-800/20 rounded-xl p-4 border border-zinc-800/30">
        <p className="text-[10px] text-zinc-500 leading-relaxed">
          <span className="text-zinc-400 font-medium">提示：</span>{" "}
          延时表示在按下该键之前等待的时间。可以通过调整延时来控制点击频率。运行过程中随时可按{" "}
          <span className="text-orange-400">F10</span> 停止。
        </p>
      </div>
    </div>
  );
};
