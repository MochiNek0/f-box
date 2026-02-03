import React, { useState, useEffect } from "react";
import { useSettingsStore } from "../store/useSettingsStore";
import { Keyboard, Plus, Trash2, Power, Save, ArrowRight } from "lucide-react";

export const Settings: React.FC = () => {
  const { bossKey, setBossKey } = useSettingsStore();
  const [isRecording, setIsRecording] = useState(false);
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

  useEffect(() => {
    window.electron.getKeymapConfig().then(setKeymapConfig);
  }, []);

  const handleGlobalKeyDown = (e: KeyboardEvent) => {
    if (isRecording) {
      e.preventDefault();
      e.stopPropagation();

      const combination = [
        e.ctrlKey ? "Control" : "",
        e.shiftKey ? "Shift" : "",
        e.altKey ? "Alt" : "",
        e.metaKey ? "Command" : "",
        e.key !== "Control" &&
        e.key !== "Shift" &&
        e.key !== "Alt" &&
        e.key !== "Meta"
          ? e.key === " "
            ? "Space"
            : e.key
          : "",
      ]
        .filter(Boolean)
        .join("+");

      setBossKey(combination);
      window.electron.updateBossKey(combination);
      setIsRecording(false);
    }

    if (recordingIndex) {
      e.preventDefault();
      e.stopPropagation();

      // Normalize key for AHK
      let key = e.key;
      if (key === " ") key = "Space";

      // Distinguish Numpad keys
      if (e.location === 3) {
        // KeyboardEvent.DOM_KEY_LOCATION_NUMPAD
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
    if (isRecording || recordingIndex) {
      window.addEventListener("keydown", handleGlobalKeyDown);
    }
    return () => window.removeEventListener("keydown", handleGlobalKeyDown);
  }, [isRecording, recordingIndex]);

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

  return (
    <div className="flex-grow flex flex-col items-center justify-start p-8 bg-zinc-950 overflow-y-auto">
      <div className="w-full max-w-2xl bg-zinc-900/50 border border-zinc-800 p-8 rounded-3xl shadow-xl">
        <h2 className="text-2xl font-bold text-zinc-100 mb-8 flex items-center gap-3">
          <Keyboard className="text-orange-500" size={28} />
          软件设置
        </h2>

        <div className="space-y-8">
          <section className="bg-zinc-800/30 p-6 rounded-2xl border border-zinc-800/50">
            <label className="block text-[10px] font-bold text-zinc-500 uppercase tracking-[0.2em] mb-4">
              快捷键设置 (Hotkeys)
            </label>
            <div className="space-y-4">
              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm text-zinc-300">
                    老板键 (Boss Key)
                  </span>
                  <p className="text-[10px] text-zinc-500 italic">
                    按键后立即隐藏/显示所有窗口
                  </p>
                </div>
                <div className="flex gap-3">
                  <div
                    className={`flex-grow bg-zinc-900 border ${
                      isRecording
                        ? "border-orange-500 shadow-[0_0_15px_rgba(249,115,22,0.1)]"
                        : "border-zinc-700"
                    } rounded-xl px-4 py-3 text-zinc-200 flex items-center justify-between transition-all duration-300`}
                  >
                    <span className="font-mono text-sm tracking-widest">
                      {isRecording ? (
                        <span className="text-orange-400 animate-pulse">
                          正在录制按键...
                        </span>
                      ) : (
                        bossKey
                      )}
                    </span>
                    {isRecording && (
                      <div className="w-1.5 h-1.5 bg-orange-500 rounded-full animate-ping" />
                    )}
                  </div>
                  <button
                    onClick={() => setIsRecording(!isRecording)}
                    className={`px-6 py-3 rounded-xl font-semibold text-sm transition-all duration-300 outline-none ${
                      isRecording
                        ? "bg-red-500/10 text-red-500 hover:bg-red-500/20"
                        : "bg-orange-500 text-white hover:bg-orange-600 shadow-lg shadow-orange-500/20"
                    }`}
                  >
                    {isRecording ? "取消" : "修改"}
                  </button>
                </div>
              </div>
            </div>
          </section>

          <section className="bg-zinc-800/30 p-6 rounded-2xl border border-zinc-800/50">
            <div className="flex items-center justify-between mb-6">
              <label className="text-[10px] font-bold text-zinc-500 uppercase tracking-[0.2em]">
                按键映射 (Key Mapping)
              </label>
              <button
                onClick={toggleEnabled}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                  keymapConfig.enabled
                    ? "bg-green-500/10 text-green-500 border border-green-500/20"
                    : "bg-zinc-800 text-zinc-500 border border-zinc-700"
                }`}
              >
                <Power size={14} />
                {keymapConfig.enabled ? "已启用" : "已禁用"}
              </button>
            </div>

            <div className="space-y-3">
              {keymapConfig.mappings.map((mapping, index) => (
                <div
                  key={index}
                  className="flex items-center gap-4 animate-in fade-in slide-in-from-top-2 duration-300"
                >
                  <div className="flex-grow flex items-center gap-2">
                    {/* Source Key */}
                    <button
                      onClick={() =>
                        setRecordingIndex({ index, type: "source" })
                      }
                      className={`flex-1 h-11 bg-zinc-900 border rounded-xl px-4 text-xs font-mono flex items-center justify-center transition-all ${
                        recordingIndex?.index === index &&
                        recordingIndex.type === "source"
                          ? "border-orange-500 bg-orange-500/5 text-orange-500 shadow-[0_0_15px_rgba(249,115,22,0.1)]"
                          : "border-zinc-800 hover:border-zinc-700 text-zinc-300"
                      }`}
                    >
                      {recordingIndex?.index === index &&
                      recordingIndex.type === "source"
                        ? "等待按键..."
                        : mapping.source || "原按键"}
                    </button>

                    <div className="text-zinc-600">
                      <ArrowRight size={16} />
                    </div>

                    {/* Target Key */}
                    <button
                      onClick={() =>
                        setRecordingIndex({ index, type: "target" })
                      }
                      className={`flex-1 h-11 bg-zinc-900 border rounded-xl px-4 text-xs font-mono flex items-center justify-center transition-all ${
                        recordingIndex?.index === index &&
                        recordingIndex.type === "target"
                          ? "border-orange-500 bg-orange-500/5 text-orange-500 shadow-[0_0_15px_rgba(249,115,22,0.1)]"
                          : "border-zinc-800 hover:border-zinc-700 text-zinc-300"
                      }`}
                    >
                      {recordingIndex?.index === index &&
                      recordingIndex.type === "target"
                        ? "等待按键..."
                        : mapping.target || "目标映射"}
                    </button>
                  </div>

                  <button
                    onClick={() => removeMapping(index)}
                    className="p-3 text-zinc-600 hover:text-red-400 hover:bg-red-400/10 rounded-xl transition-all"
                    title="删除映射"
                  >
                    <Trash2 size={18} />
                  </button>
                </div>
              ))}

              <button
                onClick={addMapping}
                className="w-full h-11 border-2 border-dashed border-zinc-800 hover:border-zinc-700 hover:bg-zinc-800/20 text-zinc-500 hover:text-zinc-400 rounded-xl flex items-center justify-center gap-2 transition-all group"
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
                  * 映射仅在主窗口激活且启用状态下生效
                </p>
                <button
                  onClick={() => saveConfig()}
                  className="flex items-center gap-2 px-4 py-2 bg-zinc-100 text-zinc-900 rounded-xl text-xs font-bold hover:bg-white transition-colors"
                >
                  <Save size={14} />
                  保存设置
                </button>
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
};
