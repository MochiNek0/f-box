import React from "react";
import { X } from "lucide-react";
import { IconButton } from "../IconButton";

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  children: React.ReactNode;
  maxWidth?: string;
  showCloseButton?: boolean;
}

export const Modal: React.FC<ModalProps> = ({
  isOpen,
  onClose,
  children,
  maxWidth = "max-w-md",
  showCloseButton = true,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center p-gr-3 z-50">
      <div
        className={`glass-card p-0 w-full ${maxWidth} max-h-[calc(100vh-24px)] shadow-2xl overflow-auto relative smooth-transition`}
        role="dialog"
        aria-modal="true"
      >
        {showCloseButton && (
          <IconButton
            icon={<X size={20} />}
            onClick={onClose}
            size="md"
            className="absolute top-gr-3 right-gr-3 h-8 w-8 inline-flex items-center justify-center bg-transparent rounded-gr-2 text-zinc-400 hover:text-foreground hover:bg-white/10 transition-all outline-none z-10 smooth-transition"
            aria-label="关闭"
          />
        )}
        <div className="p-gr-4">
          {children}
        </div>
      </div>
    </div>
  );
};
