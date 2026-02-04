import React, { useState, useEffect } from "react";
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
      window.addEventListener("keydown", handleGlobalKeyDown);
    }
    return () => window.removeEventListener("keydown", handleGlobalKeyDown);
  }, [recordingIndex]);

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
                    : mapping.source || "点击录入 / 右键选择"}

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
                    : mapping.target || "点击录入 / 右键选择"}

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
