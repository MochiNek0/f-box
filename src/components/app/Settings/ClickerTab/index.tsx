import React, { useState, useEffect, useRef } from "react";
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
import { NumberInput } from "../../../common/NumberInput";
import { KeySelectorDropdown } from "../KeySelectorDropdown";

const isWindows = () => window.electron.getPlatform() === "win32";

export interface ClickerStep {
  id: string;
  key: string;
  intervalMs: number;
}

interface AutomationKeyEvent {
  t: number;
  type: "keydown" | "keyup" | "mousedown" | "mouseup" | "mousemove";
  key?: string;
  button?: string;
  x?: number;
  y?: number;
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
  const [isPlatformSupported, setIsPlatformSupported] = useState(true);
  const [steps, setSteps] = useState<ClickerStep[]>([{ id: "step-1", key: "S", intervalMs: 100 }]);
  const [loopCount, setLoopCount] = useState<number>(0); // 0 = infinite
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [statusMessage, setStatusMessage] = useState<string>("");
  const [recordingIndex, setRecordingIndex] = useState<{ id: string } | null>(null);
  const [selectorState, setSelectorState] = useState<{ id: string, isOpen: boolean } | null>(null);

  useEffect(() => {
    setIsPlatformSupported(isWindows());
  }, []);

  if (!isPlatformSupported) {
    return (
      <div className="space-y-gr-4">
        <section className="glass p-gr-4 rounded-gr-4">
          <div className="flex flex-col items-center justify-center py-gr-5 text-center">
            <div className="w-16 h-16 rounded-full bg-white/5 flex items-center justify-center mb-gr-3">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="32"
                height="32"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="text-zinc-500"
              >
                <rect width="18" height="18" x="3" y="3" rx="2" ry="2" />
                <line x1="9" x2="15" y1="9" y2="15" />
                <line x1="15" x2="9" y1="9" y2="15" />
              </svg>
            </div>
            <h3 className="text-lg font-black text-foreground mb-gr-1 uppercase tracking-tighter">
              此功能仅支持 Windows
            </h3>
            <p className="text-sm text-zinc-500 max-w-md font-medium">
              连点器功能依赖 AutoHotkey，目前仅在 Windows 平台上可用。
            </p>
          </div>
        </section>
      </div>
    );
  }

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

  const handleGlobalKeyDown = (e: KeyboardEvent) => {
    if (recordingIndex) {
      e.preventDefault();
      e.stopPropagation();

      let key = e.key;
      if (key === " ") key = "Space";
      if (key.startsWith("Arrow")) key = key.replace("Arrow", "");
      if (key === "PageUp") key = "PgUp";
      if (key === "PageDown") key = "PgDn";

      if (e.location === 3) {
        if (key >= "0" && key <= "9") {
          key = "Numpad" + key;
        } else if (key === "Enter") {
          key = "NumpadEnter";
        } else if (key === ".") {
          key = "NumpadDot";
        } else if (key === "+") {
          key = "NumpadAdd";
        } else if (key === "-") {
          key = "NumpadSub";
        } else if (key === "*") {
          key = "NumpadMult";
        } else if (key === "/") {
          key = "NumpadDiv";
        }
      }

      handleUpdateStep(recordingIndex.id, "key", key);
      setRecordingIndex(null);
    }
  };

  useEffect(() => {
    if (recordingIndex) {
      window.electron.suspendKeymap();
      window.addEventListener("keydown", handleGlobalKeyDown);
    } else {
      window.electron.resumeKeymap();
    }
    return () => {
      window.removeEventListener("keydown", handleGlobalKeyDown);
    };
  }, [recordingIndex, steps]);

  // Ensure Keymap is resumed when component unmounts if it was recording
  useEffect(() => {
    return () => {
      window.electron.resumeKeymap();
    };
  }, []);

  const requestRef = useRef<number | null>(null);

  const pollGamepads = () => {
    if (!recordingIndex) return;

    const gamepads = navigator.getGamepads();
    for (let gamepadIdx = 0; gamepadIdx < gamepads.length; gamepadIdx++) {
      const gamepad = gamepads[gamepadIdx];
      if (!gamepad) continue;

      const gamepadNumber = gamepadIdx + 1;

      const buttonNames = [
        "A", "B", "X", "Y", "LB", "RB", "LT", "RT", "BACK", "START", "LS", "RS", "DPAD_UP", "DPAD_DOWN", "DPAD_LEFT", "DPAD_RIGHT"
      ];

      for (let i = 0; i < gamepad.buttons.length; i++) {
        const button = gamepad.buttons[i];
        if (button.pressed || button.value > 0.5) {
          const keyName = i < buttonNames.length ? buttonNames[i] : `${i + 1}`;
          const key = `${gamepadNumber}Joy${keyName}`;
          handleUpdateStep(recordingIndex.id, "key", key);
          setRecordingIndex(null);
          return;
        }
      }

      const axisNames = ["LX", "LY", "RX", "RY"];
      for (let i = 0; i < Math.min(gamepad.axes.length, 4); i++) {
        const axisValue = gamepad.axes[i];
        if (Math.abs(axisValue) > 0.5) {
          let direction = "";
          const axisName = axisNames[i];

          if (i === 1 || i === 3) {
            direction = axisValue < -0.5 ? "+" : "-";
          } else {
            direction = axisValue > 0.5 ? "+" : "-";
          }

          const key = `${gamepadNumber}Joy${axisName}${direction}`;
          handleUpdateStep(recordingIndex.id, "key", key);
          setRecordingIndex(null);
          return;
        }
      }
    }
    requestRef.current = requestAnimationFrame(pollGamepads);
  };

  useEffect(() => {
    if (recordingIndex) {
      requestRef.current = requestAnimationFrame(pollGamepads);
    }
    return () => {
      if (requestRef.current !== null) {
        cancelAnimationFrame(requestRef.current);
      }
    };
  }, [recordingIndex, steps]);

  // Helper to format key names for display
  const formatKeyDisplay = (key: string) => {
    if (!key) return null;

    // Gamepad mapping visualization
    const joyMatch = key.match(/^(\d+)Joy(.+)$/);
    if (joyMatch) {
      const pIdx = joyMatch[1];
      let btn = joyMatch[2];

      const btnMap: Record<string, string> = {
        DPAD_UP: "↑", DPAD_DOWN: "↓", DPAD_LEFT: "←", DPAD_RIGHT: "→",
        UP: "↑", DOWN: "↓", LEFT: "←", RIGHT: "→",
        "LX+": "L-Stick →", "LX-": "L-Stick ←", "LY+": "L-Stick ↑", "LY-": "L-Stick ↓",
        "RX+": "R-Stick →", "RX-": "R-Stick ←", "RY+": "R-Stick ↑", "RY-": "R-Stick ↓",
        Lt: "LT", Rt: "RT",
      };

      if (btnMap[btn]) btn = btnMap[btn];

      return (
        <span className="inline-flex items-center gap-1">
          <span className="opacity-50 text-[10px]">🎮 P{pIdx}</span>
          <span className="font-bold">{btn}</span>
        </span>
      );
    }

    return key;
  };

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
    setSteps((prev) =>
      prev.map((s) => {
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
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
    setStatusMessage("正在保存配置...");
    let currentT = 0;
    const events: AutomationKeyEvent[] = [];
    for (const step of steps) {
      const isMouseButton = ["LButton", "RButton", "MButton", "XButton1", "XButton2"].includes(step.key);
      const isGamepad = /^\d+Joy/.test(step.key);
      const keyToSend = (isMouseButton || isGamepad) ? step.key : step.key.toUpperCase();
      
      currentT += step.intervalMs;
      
      if (isMouseButton) {
        const button = step.key.toLowerCase().replace("button", "");
        events.push({ t: currentT, type: "mousedown", button });
        currentT += 10;
        events.push({ t: currentT, type: "mouseup", button });
      } else {
        events.push({ t: currentT, type: "keydown", key: keyToSend });
        currentT += 10;
        events.push({ t: currentT, type: "keyup", key: keyToSend });
      }
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
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
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
      const isMouseButton = ["LButton", "RButton", "MButton", "XButton1", "XButton2"].includes(step.key);
      const isGamepad = /^\d+Joy/.test(step.key);
      const keyToSend = (isMouseButton || isGamepad) ? step.key : step.key.toUpperCase();

      // Delay before action
      currentT += step.intervalMs;

      if (isMouseButton) {
        const button = step.key.toLowerCase().replace("button", ""); // "left", "right", etc.
        events.push({
          t: currentT,
          type: "mousedown",
          button: button,
        });

        // Quick release
        currentT += 10;
        events.push({
          t: currentT,
          type: "mouseup",
          button: button,
        });
      } else {
        events.push({
          t: currentT,
          type: "keydown",
          key: keyToSend,
        });

        // Quick keyup (e.g. 10ms later)
        currentT += 10;
        events.push({
          t: currentT,
          type: "keyup",
          key: keyToSend,
        });
      }
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
    <div className="space-y-gr-4">
      <section className="glass p-gr-4 rounded-gr-4">
        <div className="flex justify-between items-center mb-gr-3">
          <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">
            按键序列设置
          </label>
          <Button
            onClick={handleAddStep}
            variant="secondary"
            disabled={isPlaying}
            className="h-8 px-gr-3 py-1 flex items-center text-[10px] font-black uppercase tracking-tighter"
          >
            <Plus size={14} className="mr-gr-1" />
            添加按键
          </Button>
        </div>

        <div className="space-y-gr-2">
          {steps.map((step, index) => (
            <div
              key={step.id}
              className="flex items-center gap-gr-3 bg-white/5 p-gr-3 rounded-gr-3 border border-white/5"
            >
              <div className="flex-shrink-0 text-zinc-500 font-mono text-[10px] w-6 text-center font-black">
                #{index + 1}
              </div>

              <div className="flex-1 flex gap-gr-3 max-md:flex-col">
                <div className="flex-1 flex items-center gap-gr-2 relative">
                  <span className="text-[10px] text-zinc-500 font-black uppercase tracking-tighter">按键</span>
                  
                  <div className="relative">
                    <button
                      disabled={isPlaying}
                      onContextMenu={(e) => {
                        e.preventDefault();
                        if (!isPlaying) {
                          setSelectorState({
                            id: step.id,
                            isOpen: true,
                          });
                        }
                      }}
                      onClick={() => !isPlaying && setRecordingIndex({ id: step.id })}
                      className={`min-w-[72px] h-gr-4 border rounded-gr-1 px-gr-3 flex items-center justify-center text-[10px] font-mono transition-all disabled:opacity-50 uppercase tracking-tighter font-black shadow-lg ${
                        recordingIndex?.id === step.id
                          ? "border-primary bg-primary/10 text-primary shadow-[0_0_15px_rgba(var(--primary),0.1)]"
                          : "bg-white/5 border-border hover:border-primary text-primary"
                      }`}
                    >
                      {recordingIndex?.id === step.id ? "请按键..." : (formatKeyDisplay(step.key) || "选择")}
                    </button>

                    {/* Key Selector Dropdown */}
                    {selectorState?.isOpen && selectorState.id === step.id && (
                      <KeySelectorDropdown
                        type="source"
                        onSelect={(key) => {
                          handleUpdateStep(step.id, "key", key);
                          setSelectorState(null);
                        }}
                        onClose={() => setSelectorState(null)}
                      />
                    )}
                  </div>
                </div>

                <div className="flex-1 flex items-center gap-gr-2">
                  <span className="text-[10px] text-zinc-500 font-black uppercase tracking-tighter">延时 (ms)</span>
                  <NumberInput
                    min={0}
                    disabled={isPlaying}
                    value={step.intervalMs}
                    onChange={(val) =>
                      handleUpdateStep(step.id, "intervalMs", val)
                    }
                    className="w-24 text-[10px] font-black"
                  />
                </div>
              </div>

              <div className="flex items-center gap-gr-1">
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
                <div className="w-px h-4 bg-white/10 mx-gr-1"></div>
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
            <p className="text-sm text-zinc-600 italic text-center py-gr-3">
              请添加按键
            </p>
          )}
        </div>
      </section>

      <section className="glass p-gr-4 rounded-gr-4">
        <label className="block text-[10px] font-black text-zinc-500 uppercase tracking-widest mb-gr-3">
          运行设置
        </label>

        <div className="flex items-center gap-gr-3 mb-gr-4">
          <div className="flex-1">
            <label className="text-[10px] font-black text-zinc-500 uppercase tracking-tighter block mb-gr-2">
              循环次数 (0 为无限循环)
            </label>
            <NumberInput
              min={0}
              value={loopCount}
              onChange={setLoopCount}
              disabled={isPlaying}
              className="max-w-[200px]"
            />
          </div>
        </div>

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-gr-3">
            {!isPlaying ? (
              <>
                <Button
                  onClick={generateEventsAndPlay}
                  variant="primary"
                  className="flex items-center px-gr-4"
                  disabled={steps.length === 0}
                >
                  <Play size={16} className="mr-gr-2" />
                  启动连点器
                </Button>
                <Button
                  onClick={handleSaveConfig}
                  variant="secondary"
                  className="flex items-center px-gr-4"
                  disabled={steps.length === 0}
                >
                  <Save size={16} className="mr-gr-2" />
                  保存配置
                </Button>
              </>
            ) : (
              <Button
                onClick={handleStop}
                variant="danger"
                className="flex items-center px-gr-4"
              >
                <Square size={16} className="mr-gr-2" />
                停止运行 (F10)
              </Button>
            )}
          </div>

          <div className="text-sm text-zinc-400">
            {statusMessage && (
              <span className="flex items-center gap-gr-2 uppercase tracking-tighter font-black text-[10px]">
                {isPlaying && (
                  <span className="w-2 h-2 rounded-full bg-primary animate-pulse shadow-[0_0_8px_rgba(var(--primary),0.5)]"></span>
                )}
                {statusMessage}
              </span>
            )}
          </div>
        </div>
      </section>

      {/* Usage Tips */}
      <div className="glass p-gr-3 rounded-gr-3 border border-white/5">
        <p className="text-[10px] text-zinc-500 leading-relaxed font-medium">
          <span className="text-zinc-400 font-black uppercase tracking-widest mr-gr-1 shadow-primary/10">提示：</span>{" "}
          延时表示在按下该键之前等待的时间。可以通过调整延时来控制点击频率。运行过程中随时可按{" "}
          <span className="text-primary font-bold">F10</span> 停止。
        </p>
      </div>
    </div>
  );
};
