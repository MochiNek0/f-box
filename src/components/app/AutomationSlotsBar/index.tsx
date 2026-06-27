import React, { useCallback, useEffect, useState } from "react";
import { Loader2, X } from "lucide-react";
import { IconButton } from "../../common/IconButton";
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
  const [slots, setSlots] = useState<AutomationHotkeySlots>(createEmptySlots);
  const [runningSlot, setRunningSlot] = useState<AutomationHotkeyKey | null>(
    null,
  );
  const [savingSlot, setSavingSlot] = useState<AutomationHotkeyKey | null>(
    null,
  );
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
        action === "MAX_LOOPS_REACHED" ||
        action === "OCR_FAILED"
      ) {
        setRunningSlot(null);
        if (action === "HOTKEY_SLOT_STOPPED") {
          setMessage(`${parts[2]} stopped`);
        } else if (action === "OCR_FAILED") {
          setMessage("OCR 识别故障，已停止");
        }
        return;
      }

      if (action === "RECORD_DONE") {
        void refreshData();
      }
    });

    const detachSlotsChanged = window.electron.automation.onHotkeySlotsChanged(
      () => {
        void refreshData();
      },
    );

    return () => {
      detachStatus();
      detachSlotsChanged();
    };
  }, [refreshData]);

  const handleSlotChange = async (key: AutomationHotkeyKey, value: string) => {
    const nextSlots = {
      ...slots,
      [key]: value || null,
    };
    setSlots(nextSlots);
    setSavingSlot(key);

    try {
      const result = await window.electron.automation.saveHotkeySlots(nextSlots);
      if (result.success) {
        setSlots(result.slots ?? nextSlots);
        setMessage(value ? `${key}: ${value}` : `${key}: empty`);
      } else {
        setMessage(result.error ?? "Failed to save slot");
        void refreshData();
      }
    } catch {
      setMessage("Failed to save slot");
      void refreshData();
    } finally {
      setSavingSlot(null);
    }
  };

  return (
    <div className="flex-shrink-0 h-10 flex items-center gap-2 pl-1 pr-2.5 bg-background/95 max-lg:max-w-[46vw] overflow-x-auto no-scrollbar">
      {HOTKEY_KEYS.map((key) => {
        const scriptName = slots[key];
        const isRunning = runningSlot === key;
        const isSaving = savingSlot === key;
        const hasScript = Boolean(scriptName);

        return (
          <div
            key={key}
            className={`group h-8 min-w-[112px] max-w-[148px] flex items-center gap-1 rounded-gr-2 px-1.5 transition-all ${
              isRunning
                ? "bg-primary/[0.12] shadow-[0_0_14px_hsl(var(--primary)_/_0.22)]"
                : hasScript
                  ? "bg-white/[0.045] hover:bg-white/[0.075]"
                  : "bg-white/[0.018] hover:bg-white/[0.045]"
            }`}
            title={scriptName ? `${key}: ${scriptName}` : `${key}: empty`}
          >
            <div
              className={`w-7 h-5 flex-shrink-0 rounded-gr-1 text-[10px] font-black flex items-center justify-center font-mono ${
                isRunning
                  ? "bg-primary/[0.2] text-primary"
                  : hasScript
                    ? "bg-zinc-900/80 text-zinc-200"
                    : "bg-zinc-900/50 text-zinc-600"
              }`}
            >
              {key}
            </div>

            <select
              value={scriptName ?? ""}
              onChange={(event) => handleSlotChange(key, event.target.value)}
              disabled={isSaving}
              className={`min-w-0 flex-1 bg-transparent text-[10px] font-bold border-none outline-none cursor-pointer truncate focus:text-zinc-100 disabled:cursor-wait ${
                hasScript ? "text-zinc-300" : "text-zinc-600"
              }`}
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

            {isSaving ? (
              <Loader2
                size={12}
                className="flex-shrink-0 animate-spin text-zinc-500"
              />
            ) : isRunning ? (
              <span className="w-1.5 h-1.5 rounded-full bg-primary shadow-[0_0_8px_hsl(var(--primary)_/_0.8)] flex-shrink-0 animate-pulse" />
            ) : (
              <span
                className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                  hasScript ? "bg-emerald-400/70" : "bg-zinc-700"
                }`}
              />
            )}

            <IconButton
              type="button"
              icon={<X size={12} />}
              onClick={() => handleSlotChange(key, "")}
              disabled={!scriptName || isSaving}
              size="sm"
              className="w-5 h-5 flex-shrink-0 rounded-gr-1 flex items-center justify-center text-zinc-500 opacity-70 transition-all hover:text-red-400 hover:bg-red-500/10 hover:opacity-100 disabled:pointer-events-none disabled:opacity-25 !outline-none"
              title="清空槽位"
            />
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
