import React from "react";
import { useTabStore } from "../../../store/useTabStore";
import { Plus, X, Gamepad2, Library } from "lucide-react";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { IconButton } from "../../common/IconButton";
import { AutomationSlotsBar } from "../AutomationSlotsBar";

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export const TabBar: React.FC = () => {
  const { tabs, activeTabId, addTab, closeTab, setActiveTab } = useTabStore();

  return (
    <div className="flex bg-background/95 items-center h-10 min-w-0">
      <div
        className="flex items-center px-2.5 py-1 gap-2 h-full overflow-x-auto no-scrollbar flex-1 min-w-0"
        role="tablist"
      >
        {tabs.map((tab) => (
          <div
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            role="tab"
            aria-selected={activeTabId === tab.id}
            tabIndex={0}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                setActiveTab(tab.id);
              }
            }}
            className={cn(
              "group relative flex items-center min-w-[128px] max-w-[240px] h-8 px-2.5 rounded-gr-2 transition-all cursor-pointer flex-shrink-0 duration-200 ease-out outline-none",
              activeTabId === tab.id
                ? "bg-white/[0.075] text-foreground shadow-[0_1px_0_rgba(255,255,255,0.05)_inset]"
                : "bg-transparent text-zinc-500 hover:bg-white/[0.04] hover:text-zinc-300",
            )}
          >
            <div className="mr-1.5 flex-shrink-0">
              {tab.isLibrary ? (
                <Library size={14} />
              ) : (
                <Gamepad2 size={14} className="text-accent" />
              )}
            </div>
            <span className="text-[11px] truncate flex-grow mr-1.5 select-none font-bold">
              {tab.title}
            </span>
            <IconButton
              icon={<X size={12} strokeWidth={2.5} />}
              aria-label={`Close ${tab.title}`}
              title={`Close ${tab.title}`}
              onClick={(e) => {
                e.stopPropagation();
                closeTab(tab.id);
              }}
              size="sm"
              className="bg-transparent hover:bg-red-500/20 hover:text-red-400 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-all duration-300 rounded-full"
            />

            {activeTabId === tab.id && (
              <div className="absolute bottom-0 left-2 right-2 h-[2px] bg-primary rounded-t-full shadow-[0_0_8px_hsl(var(--primary)_/_0.8)]" />
            )}
          </div>
        ))}

        <IconButton
          icon={<Plus size={16} />}
          onClick={addTab}
          aria-label="New tab"
          title="New tab"
          className="ml-0.5 self-center flex-shrink-0 rounded-gr-2 opacity-70 hover:opacity-100"
        />
      </div>

      <AutomationSlotsBar />
    </div>
  );
};
