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
      className={`flex gap-2 border-b border-zinc-800 overflow-x-auto scrollbar-hide ${className}`}
    >
      {items.map((item) => (
        <button
          key={item.id}
          onClick={() => onChange(item.id)}
          className={`px-4 py-2 text-sm bg-transparent outline-none font-medium transition-all relative whitespace-nowrap ${
            activeId === item.id
              ? "text-orange-500"
              : "text-zinc-400 hover:text-zinc-300"
          }`}
        >
          {item.label}
          {activeId === item.id && (
            <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-orange-500" />
          )}
        </button>
      ))}
    </div>
  );
};
