import React from "react";
import { X } from "lucide-react";

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
    <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center p-2 z-50">
      <div
        className={`bg-zinc-900 border border-zinc-800 p-2 rounded-2xl w-full ${maxWidth} shadow-2xl overflow-auto relative`}
      >
        {showCloseButton && (
          <button
            onClick={onClose}
            className="absolute top-4 right-4 p-2 bg-transparent rounded-xl text-zinc-400 hover:text-white transition-colors outline-none z-10"
            aria-label="关闭"
          >
            <X size={24} />
          </button>
        )}
        {children}
      </div>
    </div>
  );
};
