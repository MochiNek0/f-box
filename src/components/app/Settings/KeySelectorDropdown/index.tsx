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
      className={`absolute top-full ${type === "source" ? "left-0" : "right-0"} mt-2 bg-zinc-900 border border-zinc-700 rounded-xl shadow-2xl z-50 px-4 pb-4 max-h-[300px] overflow-y-auto animate-in fade-in slide-in-from-top-2 duration-200 min-w-40`}
    >
      <div className="flex justify-between items-center mb-4 sticky top-0 bg-zinc-900 py-2 border-b border-zinc-800 z-10">
        <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">
          选择 {type === "source" ? "源按键" : "目标按键"}
        </span>
        <IconButton
          icon={<X size={12} />}
          onClick={onClose}
          className="hover:bg-zinc-800 p-1"
        />
      </div>

      <div className="space-y-6">
        {Object.entries(KEY_GROUPS).map(([group, keys]) => (
          <div key={group}>
            <h3 className="text-[9px] uppercase tracking-wider text-zinc-600 mb-2 font-bold">
              {group}
            </h3>
            <div className="grid grid-cols-4 gap-1.5">
              {keys.map((key) => (
                <button
                  key={key}
                  onClick={() => onSelect(key)}
                  className="px-1 py-1.5 bg-zinc-800 hover:bg-orange-500 hover:text-white rounded text-[10px] text-zinc-400 transition-colors truncate"
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
