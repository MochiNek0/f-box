import React, { useEffect } from "react";
import { X } from "lucide-react";
import { IconButton } from "../../../common/IconButton";
import { KEY_GROUPS } from "../constants";

interface KeySelectorDropdownProps {
  type: "source" | "target";
  onSelect: (key: string) => void;
  onClose: () => void;
}

export const KeySelectorDropdown: React.FC<KeySelectorDropdownProps> = ({
  type,
  onSelect,
  onClose,
}) => {
  useEffect(() => {
    const handleClickOutside = () => {
      onClose();
    };
    // Use timeout to avoid immediate closing when the click that opened the dropdown also triggers this
    const timer = setTimeout(() => {
      window.addEventListener("click", handleClickOutside);
    }, 100);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("click", handleClickOutside);
    };
  }, [onClose]);

  return (
    <div
      onClick={(e) => e.stopPropagation()}
      onContextMenu={(e) => e.stopPropagation()}
      className={`absolute top-full ${type === "source" ? "left-0" : "right-0"} mt-gr-2 glass border border-white/10 rounded-gr-3 shadow-2xl z-50 px-gr-4 pb-gr-4 max-h-[300px] overflow-y-auto no-scrollbar animate-in fade-in slide-in-from-top-2 duration-200 min-w-48`}
    >
      <div className="flex justify-between items-center mb-gr-4 sticky top-0 glass-card mx-[-1rem] px-gr-4 py-gr-3 border-b border-white/5 z-10">
        <span className="text-[10px] font-black text-zinc-500 uppercase tracking-widest">
          选择 {type === "source" ? "源按键" : "目标按键"}
        </span>
        <IconButton
          icon={<X size={12} />}
          onClick={onClose}
          className="hover:bg-white/5 p-1"
        />
      </div>

      <div className="space-y-gr-4">
        {Object.entries(KEY_GROUPS).map(([group, keys]) => (
          <div key={group}>
            <h3 className="text-[9px] uppercase tracking-widest text-zinc-600 mb-gr-2 font-black">
              {group}
            </h3>
            <div className="grid grid-cols-4 gap-gr-1">
              {keys.map((key) => (
                <button
                  key={key}
                  onClick={() => onSelect(key)}
                  className="px-1 py-1.5 bg-white/5 hover:bg-primary hover:text-black rounded-gr-1 text-[10px] font-bold text-zinc-400 transition-all truncate uppercase tracking-tighter"
                  title={key}
                >
                  {key}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
