import React, { useState, useEffect, useRef } from "react";
import { Plus, Trash2, Power, Save, ArrowRight } from "lucide-react";
import { Button } from "../../../common/Button";
import { IconButton } from "../../../common/IconButton";
import { KeySelectorDropdown } from "../KeySelectorDropdown";

export const KeymapTab: React.FC = () => {
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
      // Standard Mapping (approximate for XInput/W3C Standard Gamepad)
      // 0:A, 1:B, 2:X, 3:Y, 4:LB, 5:RB, 6:LT, 7:RT, 8:Back, 9:Start, 10:LS, 11:RS, 12:Up, 13:Down, 14:Left, 15:Right
      const buttonNames = [
        "A",
        "B",
        "X",
        "Y",
        "LB",
        "RB",
        "LT",
        "RT",
        "BACK",
        "START",
        "LS",
        "RS",
        "DPAD_UP",
        "DPAD_DOWN",
        "DPAD_LEFT",
        "DPAD_RIGHT",
      ];

      for (let i = 0; i < gamepad.buttons.length; i++) {
        const button = gamepad.buttons[i];
        if (button.pressed || button.value > 0.5) {
          let keyName = "";

          if (i < buttonNames.length) {
            keyName = buttonNames[i];
          } else {
            keyName = `${i + 1}`; // Fallback to raw index if out of standard range
          }

          // Format: 1JoyA, 1JoyDPAD_UP, etc.
          const key = `${gamepadNumber}Joy${keyName}`;

          const newMappings = [...keymapConfig.mappings];
          newMappings[recordingIndex.index][recordingIndex.type] = key;

          setKeymapConfig({ ...keymapConfig, mappings: newMappings });
          setRecordingIndex(null);
          return; // Stop polling once found
        }
      }

      // Check axes (joystick movements)
      // Axes mapping: [0]=LeftX, [1]=LeftY, [2]=RightX, [3]=RightY
      const axisNames = ["LX", "LY", "RX", "RY"];

      for (let i = 0; i < Math.min(gamepad.axes.length, 4); i++) {
        const axisValue = gamepad.axes[i];
        // Detect significant movement (threshold 0.5)
        if (Math.abs(axisValue) > 0.5) {
          // Determine direction: positive (+) or negative (-)
          // For Standard Gamepad:
          // Axis 1 (LY) & 3 (RY): -1 is Up, +1 is Down.
          // Axis 0 (LX) & 2 (RX): -1 is Left, +1 is Right.

          let direction = "";
          let axisName = axisNames[i];

          // Reverse Y axis logic because AHK script expects:
          // LY+ -> Physical Up (AHK) vs Web Standard Down (+)
          // LY- -> Physical Down (AHK) vs Web Standard Up (-)
          // Wait, checking AHK script again:
          // case "LY+": return state.sThumbLY > 16000  ; XInput中 Y+ 是物理向上
          // case "LY-": return state.sThumbLY < -16000 ; XInput中 Y- 是物理向下
          //
          // Web Gamepad API:
          // Axis 1: -1 (Up), 1 (Down)
          //
          // So if Web Axis is < -0.5 (Up), we want to map to "LY+" for AHK?
          // If Web Axis is > 0.5 (Down), we want to map to "LY-" for AHK?
          // Let's re-read the AHK script carefully.
          //
          // Line 218: case "LY+": return state.sThumbLY > 16000  ; XInput中 Y+ 是物理向上
          // Line 219: case "LY-": return state.sThumbLY < -16000 ; XInput中 Y- 是物理向下
          //
          // So "LY+" in AHK means Stick Up.
          // In Web API, Stick Up is negative (-1).
          // So if axisValue < -0.5, we should produce "LY+".

          if (i === 1 || i === 3) {
            // Y axes
            if (axisValue < -0.5)
              direction = "+"; // Up
            else direction = "-"; // Down
          } else {
            // X axes (Standard: -1 Left, +1 Right)
            // AHK:
            // case "LX+": return state.sThumbLX > 16000 (Right)
            // case "LX-": return state.sThumbLX < -16000 (Left)
            if (axisValue > 0.5)
              direction = "+"; // Right
            else direction = "-"; // Left
          }

          // Format: 1JoyLX+, 1JoyLX-, etc.
          const key = `${gamepadNumber}Joy${axisName}${direction}`;

          const newMappings = [...keymapConfig.mappings];
          newMappings[recordingIndex.index][recordingIndex.type] = key;

          setKeymapConfig({ ...keymapConfig, mappings: newMappings });
          setRecordingIndex(null);
          return; // Stop polling once found
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
    <section className="bg-zinc-800/30 p-4 rounded-2xl border border-zinc-800/50 relative">
      <div className="flex items-center justify-between mb-6">
        <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-[0.2em]">
          按键映射
        </label>
        <Button
          onClick={toggleEnabled}
          variant="ghost"
          size="sm"
          className={`flex items-center gap-2 ${
            keymapConfig.enabled
              ? "bg-green-500/10 text-green-500 border border-green-500/20"
              : "bg-zinc-800 text-zinc-500 border border-zinc-700"
          }`}
        >
          <Power size={14} />
          {keymapConfig.enabled ? "已启用" : "已禁用"}
        </Button>
      </div>

      <div className="space-y-3">
        {keymapConfig.mappings.map((mapping, index) => (
          <div
            key={index}
            className="flex gap-4 animate-in fade-in slide-in-from-top-2 duration-300"
          >
            <div className="flex items-center gap-2 w-full">
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
                  className={`cursor-pointer h-11 bg-zinc-900 border rounded-xl px-4 text-xs font-mono flex items-center justify-center transition-all relative group ${
                    recordingIndex?.index === index &&
                    recordingIndex.type === "source"
                      ? "border-orange-500 bg-orange-500/5 text-orange-500 shadow-[0_0_15px_rgba(249,115,22,0.1)]"
                      : "border-zinc-800 hover:border-zinc-700 text-zinc-300"
                  } max-md:text-xs max-md:px-2 max-md:h-9`}
                >
                  {recordingIndex?.index === index &&
                  recordingIndex.type === "source"
                    ? "请按键..."
                    : formatKeyDisplay(mapping.source) || "点击录入 / 右键选择"}

                  <div className="absolute inset-0 bg-white/5 opacity-0 group-hover:opacity-100 transition-opacity rounded-xl pointer-events-none" />

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
                <ArrowRight className="max-md:hidden" size={16} />
                <ArrowRight className="md:hidden" size={12} />
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
                  className={`cursor-pointer h-11 bg-zinc-900 border rounded-xl px-4 text-xs font-mono flex items-center justify-center transition-all relative group ${
                    recordingIndex?.index === index &&
                    recordingIndex.type === "target"
                      ? "border-orange-500 bg-orange-500/5 text-orange-500 shadow-[0_0_15px_rgba(249,115,22,0.1)]"
                      : "border-zinc-800 hover:border-zinc-700 text-zinc-300"
                  } max-md:text-xs max-md:px-2 max-md:h-9`}
                >
                  {recordingIndex?.index === index &&
                  recordingIndex.type === "target"
                    ? "请按键..."
                    : formatKeyDisplay(mapping.target) || "点击录入 / 右键选择"}

                  <div className="absolute inset-0 bg-white/5 opacity-0 group-hover:opacity-100 transition-opacity rounded-xl pointer-events-none" />

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
              className="p-3 rounded-xl"
            />
          </div>
        ))}

        <button
          onClick={addMapping}
          className="w-full h-11 border-2 border-dashed border-zinc-800 hover:border-zinc-700 hover:bg-zinc-800/20 text-zinc-500 hover:text-zinc-400 rounded-xl flex items-center justify-center gap-2 transition-all group bg-transparent outline-none"
        >
          <Plus
            size={18}
            className="group-hover:scale-110 transition-transform"
          />
          <span className="text-xs font-bold uppercase tracking-wider">
            添加新映射
          </span>
        </button>
      </div>

      {keymapConfig.mappings.length > 0 && (
        <div className="mt-6 pt-6 border-t border-zinc-800/50 flex justify-between items-center">
          <p className="text-[10px] text-zinc-500 italic">
            * 左键点击录入,右键点击选择
          </p>
          <Button
            onClick={() => saveConfig()}
            variant="ghost"
            size="sm"
            className="flex items-center gap-2 bg-zinc-100 text-zinc-900 hover:bg-white"
          >
            <Save size={14} />
            <span className="max-md:hidden">保存设置</span>
          </Button>
        </div>
      )}
    </section>
  );
};
