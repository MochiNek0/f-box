import React, { useCallback, useEffect, useState } from "react";
import { X } from "lucide-react";
import type {
  AutomationHotkeyKey,
  AutomationHotkeySlots,
} from "../../../types/electron";

const HOTKEY_KEYS: AutomationHotkeyKey[] = ["F3", "F4", "F5"];

const createEmptySlots = (): AutomationHotkeySlots => ({
  F3: null,
  F4: null,
  F5: null,
});

const reconcileSlots = (
  slots: AutomationHotkeySlots,
  scripts: string[],
): AutomationHotkeySlots => {
  const availableScripts = new Set(scripts);
  const nextSlots = createEmptySlots();

  for (const key of HOTKEY_KEYS) {
    const scriptName = slots[key];
    nextSlots[key] =
      scriptName && availableScripts.has(scriptName) ? scriptName : null;
  }

  return nextSlots;
};

export const AutomationSlotsBar: React.FC = () => {
  const [scripts, setScripts] = useState<string[]>([]);
  const [slots, setSlots] = useState<AutomationHotkeySlots>(
    createEmptySlots,
  );
  const [runningSlot, setRunningSlot] =
    useState<AutomationHotkeyKey | null>(null);
  const [message, setMessage] = useState("");

  const refreshData = useCallback(async () => {
    const [scriptList, savedSlots] = await Promise.all([
      window.electron.automation.listScripts(),
      window.electron.automation.getHotkeySlots(),
    ]);
    setScripts(scriptList);
    setSlots(reconcileSlots(savedSlots, scriptList));
  }, []);

  useEffect(() => {
    let mounted = true;

    const load = async () => {
      const [scriptList, savedSlots] = await Promise.all([
        window.electron.automation.listScripts(),
        window.electron.automation.getHotkeySlots(),
      ]);
      if (!mounted) return;
      setScripts(scriptList);
      setSlots(reconcileSlots(savedSlots, scriptList));
    };

    void load();

    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    const detachStatus = window.electron.automation.onStatus((status) => {
      const parts = status.split("|");
      if (parts[0] !== "STATUS") return;

      const action = parts[1];
      if (action === "HOTKEY_SLOT_STARTED") {
        const key = parts[2] as AutomationHotkeyKey;
        const scriptName = decodeURIComponent(parts[3] ?? "");
        setRunningSlot(key);
        setMessage(`${key}: ${scriptName}`);
        return;
      }

      if (
        action === "HOTKEY_SLOT_STOPPED" ||
        action === "PROCESS_EXIT" ||
        action === "STOPPED" ||
        action === "CONDITION_MET" ||
        action === "MAX_LOOPS_REACHED"
      ) {
        setRunningSlot(null);
        if (action === "HOTKEY_SLOT_STOPPED") {
          setMessage(`${parts[2]} stopped`);
        }
        return;
      }

      if (action === "RECORD_DONE") {
        void refreshData();
      }
    });

    const detachSlotsChanged =
      window.electron.automation.onHotkeySlotsChanged(() => {
        void refreshData();
      });

    return () => {
      detachStatus();
      detachSlotsChanged();
    };
  }, [refreshData]);

  const handleSlotChange = async (
    key: AutomationHotkeyKey,
    value: string,
  ) => {
    const nextSlots = {
      ...slots,
      [key]: value || null,
    };
    setSlots(nextSlots);

    const result = await window.electron.automation.saveHotkeySlots(nextSlots);
    if (result.success) {
      setSlots(result.slots ?? nextSlots);
      setMessage(value ? `${key}: ${value}` : `${key}: empty`);
    } else {
      setMessage(result.error ?? "Failed to save slot");
      void refreshData();
    }
  };

  return (
    <div className="flex-shrink-0 h-gr-5 flex items-center gap-gr-2 border-l border-border pl-gr-2 pr-gr-3 bg-background/95 max-md:max-w-[56vw] overflow-x-auto no-scrollbar">
      {HOTKEY_KEYS.map((key) => {
        const scriptName = slots[key];
        const isRunning = runningSlot === key;

        return (
          <div
            key={key}
            className={`h-8 min-w-[132px] max-w-[160px] flex items-center gap-1.5 rounded-gr-2 border px-1.5 transition-all ${
              isRunning
                ? "border-primary/50 bg-primary/10 shadow-[0_0_12px_rgba(var(--primary),0.18)]"
                : "border-white/5 bg-white/[0.03] hover:bg-white/[0.06]"
            }`}
            title={scriptName ? `${key}: ${scriptName}` : `${key}: empty`}
          >
            <div className="w-8 h-5 flex-shrink-0 rounded-gr-1 bg-zinc-900/70 border border-white/10 text-[10px] font-black text-primary flex items-center justify-center font-mono">
              {key}
            </div>

            <select
              value={scriptName ?? ""}
              onChange={(event) => handleSlotChange(key, event.target.value)}
              className="min-w-0 flex-1 bg-transparent text-[10px] font-bold text-zinc-300 border-none outline-none cursor-pointer truncate"
              aria-label={`${key} automation slot`}
            >
              <option value="" className="bg-zinc-900 text-zinc-400">
                空槽
              </option>
              {scripts.map((script) => (
                <option
                  key={script}
                  value={script}
                  className="bg-zinc-900 text-zinc-200"
                >
                  {script}
                </option>
              ))}
            </select>

            {isRunning && (
              <span className="w-1.5 h-1.5 rounded-full bg-primary shadow-[0_0_8px_rgba(var(--primary),0.8)] flex-shrink-0" />
            )}

            <button
              type="button"
              onClick={() => handleSlotChange(key, "")}
              disabled={!scriptName}
              className="w-5 h-5 flex-shrink-0 rounded-gr-1 flex items-center justify-center text-zinc-500 hover:text-red-400 hover:bg-red-500/10 transition-all disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-zinc-500"
              title="清空槽位"
            >
              <X size={12} />
            </button>
          </div>
        );
      })}

      {message && (
        <div className="hidden xl:block max-w-[120px] truncate text-[9px] font-bold text-zinc-500 uppercase tracking-tighter">
          {message}
        </div>
      )}
    </div>
  );
};
