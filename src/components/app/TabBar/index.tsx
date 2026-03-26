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
    <div className="flex bg-background border-b border-border items-end px-gr-3 gap-gr-2 h-gr-5 overflow-x-auto no-scrollbar">
      {tabs.map((tab) => (
        <div
          key={tab.id}
          onClick={() => setActiveTab(tab.id)}
          className={cn(
            "group relative flex items-center min-w-[140px] max-w-[280px] h-gr-5 px-gr-3 rounded-t-gr-3 transition-all cursor-pointer flex-shrink-0 duration-300 ease-out",
            activeTabId === tab.id
              ? "bg-card text-foreground shadow-[0_-4px_12px_-4px_rgba(0,0,0,0.5)]"
              : "bg-transparent text-zinc-500 hover:bg-white/[0.03] hover:text-zinc-300",
          )}
        >
          <div className="mr-gr-2 flex-shrink-0">
            {tab.isLibrary ? (
              <Library size={14} />
            ) : (
              <Gamepad2 size={14} className="text-accent" />
            )}
          </div>
          <span className="text-xs truncate flex-grow mr-gr-2 select-none font-bold">
            {tab.title}
          </span>
          <IconButton
            icon={<X size={12} strokeWidth={2.5} />}
            onClick={(e) => {
              e.stopPropagation();
              closeTab(tab.id);
            }}
            size="sm"
            className="bg-transparent hover:bg-red-500/20 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all duration-300 rounded-full w-5 h-5"
          />

          {/* Active indicator */}
          {activeTabId === tab.id && (
            <div className="absolute bottom-0 left-gr-2 right-gr-2 h-[2px] bg-primary rounded-t-full shadow-[0_0_8px_rgba(var(--primary),0.8)]" />
          )}
        </div>
      ))}

      <IconButton
        icon={<Plus size={16} />}
        onClick={addTab}
        className="mb-0 ml-gr-1 self-center"
      />
    </div>
  );
};
