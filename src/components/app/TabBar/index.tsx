import React from "react";
import { useTabStore } from "../../../store/useTabStore";
import { Plus, X, Gamepad2, Library } from "lucide-react";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { IconButton } from "../../common/IconButton";

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export const TabBar: React.FC = () => {
  const { tabs, activeTabId, addTab, closeTab, setActiveTab } = useTabStore();

  return (
    <div className="flex bg-zinc-950 border-b border-zinc-800 items-end px-2 gap-1 h-10 overflow-x-auto no-scrollbar">
      {tabs.map((tab) => (
        <div
          key={tab.id}
          onClick={() => setActiveTab(tab.id)}
          className={cn(
            "group relative flex items-center min-w-[100px] max-w-[200px] h-8 px-3 rounded-t-lg transition-all cursor-pointer flex-shrink-0",
            activeTabId === tab.id
              ? "bg-zinc-800 text-zinc-100"
              : "bg-zinc-900/50 text-zinc-500 hover:bg-zinc-800/80 hover:text-zinc-300",
          )}
        >
          <div className="mr-2 flex-shrink-0">
            {tab.isLibrary ? (
              <Library size={14} />
            ) : (
              <Gamepad2 size={14} className="text-orange-500" />
            )}
          </div>
          <span className="text-xs truncate flex-grow mr-2 select-none">
            {tab.title}
          </span>
          <IconButton
            icon={<X size={12} />}
            onClick={(e) => {
              e.stopPropagation();
              closeTab(tab.id);
            }}
            size="sm"
            className="bg-zinc-700 hover:bg-zinc-600"
          />

          {/* Active indicator */}
          {activeTabId === tab.id && (
            <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-orange-500 rounded-t-full" />
          )}
        </div>
      ))}

      <IconButton
        icon={<Plus size={16} />}
        onClick={addTab}
        className="mb-1 ml-1"
      />
    </div>
  );
};
