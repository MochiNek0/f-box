import React from "react";

interface NavigationTabItem {
  id: string;
  label: string;
}

interface NavigationTabProps {
  items: NavigationTabItem[];
  activeId: string;
  onChange: (id: string) => void;
  className?: string;
}

export const NavigationTab: React.FC<NavigationTabProps> = ({
  items,
  activeId,
  onChange,
  className = "",
}) => {
  return (
    <div
      className={`flex gap-gr-3 border-b border-border overflow-x-auto no-scrollbar ${className}`}
    >
      {items.map((item) => (
        <button
          key={item.id}
          onClick={() => onChange(item.id)}
          className={`px-gr-4 py-gr-2 text-xs bg-transparent outline-none font-black transition-all relative whitespace-nowrap uppercase tracking-widest ${
            activeId === item.id
              ? "text-primary"
              : "text-zinc-500 hover:text-zinc-300"
          }`}
        >
          {item.label}
          {activeId === item.id && (
            <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary rounded-t-full shadow-[0_-1px_4px_rgba(var(--primary),0.5)]" />
          )}
        </button>
      ))}
    </div>
  );
};
