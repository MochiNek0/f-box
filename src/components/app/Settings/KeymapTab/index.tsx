import React, { useState, useEffect, useRef } from "react";
import { Plus, Trash2, Power, Save, ArrowRight } from "lucide-react";
import { Button } from "../../../common/Button";
import { IconButton } from "../../../common/IconButton";
import { KeySelectorDropdown } from "../KeySelectorDropdown";

const isWindows = () => window.electron.getPlatform() === "win32";

export const KeymapTab: React.FC = () => {
  const [isPlatformSupported, setIsPlatformSupported] = useState(true);

  useEffect(() => {
    setIsPlatformSupported(isWindows());
  }, []);

  if (!isPlatformSupported) {
    return (
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
            键位映射功能依赖 AutoHotkey，目前仅在 Windows 平台上可用。
          </p>
        </div>
      </section>
    );
  }

  const [keymapConfig, setKeymapConfig] = useState<{
    enabled: boolean;
    mappings: Array<{ source: string; target: string }>;
  }>({
    enabled: false,
    mappings: [],
  });
  const [recordingIndex, setRecordingIndex] = useState<{
    index: number;
    type: "source" | "target";
  } | null>(null);

  const [selectorState, setSelectorState] = useState<{
    isOpen: boolean;
    index: number;
    type: "source" | "target";
  } | null>(null);

  useEffect(() => {
    window.electron.getKeymapConfig().then(setKeymapConfig);
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

      const newMappings = [...keymapConfig.mappings];
      newMappings[recordingIndex.index][recordingIndex.type] = key;

      setKeymapConfig({ ...keymapConfig, mappings: newMappings });
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
  }, [recordingIndex]);

  // Ensure Keymap is resumed when component unmounts if it was recording
  useEffect(() => {
    return () => {
      window.electron.resumeKeymap();
    };
  }, []);

  // Helper to format key names for display
  const formatKeyDisplay = (key: string) => {
    if (!key) return null;

    // Gamepad mapping visualization
    const joyMatch = key.match(/^(\d+)Joy(.+)$/);
    if (joyMatch) {
      const pIdx = joyMatch[1];
      let btn = joyMatch[2];

      // Map button codes to symbols/names
      const btnMap: Record<string, string> = {
        DPAD_UP: "↑",
        DPAD_DOWN: "↓",
        DPAD_LEFT: "←",
        DPAD_RIGHT: "→",
        UP: "↑",
        DOWN: "↓",
        LEFT: "←",
        RIGHT: "→",
        "LX+": "L-Stick →",
        "LX-": "L-Stick ←",
        "LY+": "L-Stick ↑",
        "LY-": "L-Stick ↓",
        "RX+": "R-Stick →",
        "RX-": "R-Stick ←",
        "RY+": "R-Stick ↑",
        "RY-": "R-Stick ↓",
        Lt: "LT",
        Rt: "RT",
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

  // Gamepad polling
  const requestRef = useRef<number | null>(null);

  const pollGamepads = () => {
    if (!recordingIndex) return;

    const gamepads = navigator.getGamepads();
    for (let gamepadIdx = 0; gamepadIdx < gamepads.length; gamepadIdx++) {
      const gamepad = gamepads[gamepadIdx];
      if (!gamepad) continue;

      // Gamepad index for AHK (1-indexed)
      const gamepadNumber = gamepadIdx + 1;

      // Check buttons
      const buttonNames = [
        "A", "B", "X", "Y", "LB", "RB", "LT", "RT", "BACK", "START", "LS", "RS", "DPAD_UP", "DPAD_DOWN", "DPAD_LEFT", "DPAD_RIGHT",
      ];

      for (let i = 0; i < gamepad.buttons.length; i++) {
        const button = gamepad.buttons[i];
        if (button.pressed || button.value > 0.5) {
          let keyName = i < buttonNames.length ? buttonNames[i] : `${i + 1}`;
          const key = `${gamepadNumber}Joy${keyName}`;

          const newMappings = [...keymapConfig.mappings];
          newMappings[recordingIndex.index][recordingIndex.type] = key;

          setKeymapConfig({ ...keymapConfig, mappings: newMappings });
          setRecordingIndex(null);
          return;
        }
      }

      // Check axes
      const axisNames = ["LX", "LY", "RX", "RY"];
      for (let i = 0; i < Math.min(gamepad.axes.length, 4); i++) {
        const axisValue = gamepad.axes[i];
        if (Math.abs(axisValue) > 0.5) {
          let direction = "";
          const axisName = axisNames[i];

          if (i === 1 || i === 3) {
            if (axisValue < -0.5) direction = "+";
            else direction = "-";
          } else {
            if (axisValue > 0.5) direction = "+";
            else direction = "-";
          }

          const key = `${gamepadNumber}Joy${axisName}${direction}`;
          const newMappings = [...keymapConfig.mappings];
          newMappings[recordingIndex.index][recordingIndex.type] = key;

          setKeymapConfig({ ...keymapConfig, mappings: newMappings });
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
  }, [recordingIndex, keymapConfig]);

  const saveConfig = (newConfig = keymapConfig) => {
    window.electron.saveKeymapConfig(newConfig);
    setKeymapConfig(newConfig);
  };

  const addMapping = () => {
    const newMappings = [...keymapConfig.mappings, { source: "", target: "" }];
    saveConfig({ ...keymapConfig, mappings: newMappings });
  };

  const removeMapping = (index: number) => {
    const newMappings = keymapConfig.mappings.filter((_, i) => i !== index);
    saveConfig({ ...keymapConfig, mappings: newMappings });
  };

  const toggleEnabled = () => {
    saveConfig({ ...keymapConfig, enabled: !keymapConfig.enabled });
  };

  const handleKeySelect = (key: string) => {
    if (selectorState) {
      const newMappings = [...keymapConfig.mappings];
      newMappings[selectorState.index][selectorState.type] = key;
      setKeymapConfig({ ...keymapConfig, mappings: newMappings });
      setSelectorState(null);
    }
  };

  return (
    <section className="glass p-gr-4 rounded-gr-4 relative">
      <div className="flex items-center justify-between mb-gr-4">
        <label className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">
          按键映射
        </label>
        <Button
          onClick={toggleEnabled}
          variant="secondary"
          className={`flex items-center gap-gr-2 transition-all duration-300 ${
            keymapConfig.enabled
              ? "text-primary border-primary bg-primary/10 shadow-[0_0_15px_rgba(var(--primary),0.1)]"
              : "text-zinc-500 border-zinc-700 bg-zinc-800/10"
          }`}
        >
          <Power size={14} />
          <span className="text-[10px] font-black uppercase tracking-tighter">
            {keymapConfig.enabled ? "已启用" : "已禁用"}
          </span>
        </Button>
      </div>

      <div className="space-y-gr-2">
        {keymapConfig.mappings.map((mapping, index) => (
          <div
            key={index}
            className="flex gap-gr-3 animate-in fade-in slide-in-from-top-2 duration-300"
          >
            <div className="flex items-center gap-gr-2 w-full">
              {/* Source Key */}
              <div className="flex-1 flex flex-col gap-1">
                <div
                  onContextMenu={(e) => {
                    e.preventDefault();
                    setSelectorState({
                      index,
                      type: "source",
                      isOpen: true,
                    });
                  }}
                  onClick={() => setRecordingIndex({ index, type: "source" })}
                  className={`cursor-pointer h-gr-5 bg-white/5 border rounded-gr-3 px-gr-4 text-[10px] font-mono flex items-center justify-center transition-all relative group font-black uppercase tracking-tighter ${
                    recordingIndex?.index === index &&
                    recordingIndex.type === "source"
                      ? "border-primary bg-primary/10 text-primary shadow-[0_0_15px_rgba(var(--primary),0.1)]"
                      : "border-border hover:border-primary/50 text-foreground"
                  } max-md:h-9 shadow-lg`}
                >
                  {recordingIndex?.index === index &&
                  recordingIndex.type === "source"
                    ? "请按键..."
                    : formatKeyDisplay(mapping.source) || "点击录入 / 右键选择"}

                  {/* Source Key Selector Dropdown */}
                  {selectorState?.isOpen &&
                    selectorState.index === index &&
                    selectorState.type === "source" && (
                      <KeySelectorDropdown
                        type="source"
                        onSelect={handleKeySelect}
                        onClose={() => setSelectorState(null)}
                      />
                    )}
                </div>
              </div>

              <div className="text-zinc-600">
                <ArrowRight size={16} className="opacity-30" />
              </div>

              {/* Target Key */}
              <div className="flex-1 flex flex-col gap-1">
                <div
                  onContextMenu={(e) => {
                    e.preventDefault();
                    setSelectorState({
                      index,
                      type: "target",
                      isOpen: true,
                    });
                  }}
                  onClick={() => setRecordingIndex({ index, type: "target" })}
                  className={`cursor-pointer h-gr-5 bg-white/5 border rounded-gr-3 px-gr-4 text-[10px] font-mono flex items-center justify-center transition-all relative group font-black uppercase tracking-tighter ${
                    recordingIndex?.index === index &&
                    recordingIndex.type === "target"
                      ? "border-primary bg-primary/10 text-primary shadow-[0_0_15px_rgba(var(--primary),0.1)]"
                      : "border-border hover:border-primary/50 text-foreground"
                  } max-md:h-9 shadow-lg`}
                >
                  {recordingIndex?.index === index &&
                  recordingIndex.type === "target"
                    ? "请按键..."
                    : formatKeyDisplay(mapping.target) || "点击录入 / 右键选择"}

                  {/* Target Key Selector Dropdown */}
                  {selectorState?.isOpen &&
                    selectorState.index === index &&
                    selectorState.type === "target" && (
                      <KeySelectorDropdown
                        type="target"
                        onSelect={handleKeySelect}
                        onClose={() => setSelectorState(null)}
                      />
                    )}
                </div>
              </div>
            </div>

            <IconButton
              icon={<Trash2 size={16} />}
              onClick={() => removeMapping(index)}
              variant="danger"
              title="删除映射"
              className="p-gr-3 rounded-gr-3"
            />
          </div>
        ))}

        <button
          onClick={addMapping}
          className="w-full h-gr-5 border-2 border-dashed border-white/5 hover:border-primary/30 hover:bg-primary/5 text-zinc-500 hover:text-primary rounded-gr-3 flex items-center justify-center gap-gr-2 transition-all group bg-transparent outline-none"
        >
          <Plus
            size={18}
            className="group-hover:scale-110 transition-transform"
          />
          <span className="text-[10px] font-black uppercase tracking-widest text-zinc-500 group-hover:text-primary">
            添加新映射
          </span>
        </button>
      </div>

      {keymapConfig.mappings.length > 0 && (
        <div className="mt-gr-4 pt-gr-4 border-t border-white/5 flex justify-between items-center">
          <p className="text-[10px] text-zinc-500 font-medium italic">
            * 左键点击录入, 右键点击选择
          </p>
          <Button
            onClick={() => saveConfig()}
            variant="primary"
            className="flex items-center gap-gr-2 px-gr-4"
          >
            <Save size={14} />
            <span className="text-[10px] font-black uppercase tracking-tighter">保存设置</span>
          </Button>
        </div>
      )}
    </section>
  );
};
