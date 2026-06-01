import React from "react";
import { Button } from "../Button";

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
      className={`flex gap-gr-3 overflow-x-auto no-scrollbar ${className}`}
    >
      {items.map((item) => (
        <Button
          key={item.id}
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => onChange(item.id)}
          variant="ghost"
          size="sm"
          className={`px-gr-4 py-gr-2 text-xs bg-transparent shadow-none hover:shadow-none focus-visible:bg-white/[0.04] rounded-gr-2 relative whitespace-nowrap ${
            activeId === item.id
              ? "text-primary"
              : "text-zinc-500 hover:text-zinc-300"
          }`}
        >
          {item.label}
          <div
            className={`absolute bottom-0 left-0 right-0 h-0.5 bg-primary rounded-t-full shadow-[0_-1px_4px_hsl(var(--primary)_/_0.5)] transition-all duration-200 ${
              activeId === item.id ? "opacity-100" : "opacity-0"
            }`}
          />
        </Button>
      ))}
    </div>
  );
};
