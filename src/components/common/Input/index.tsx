import React from "react";

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
}

export const Input: React.FC<InputProps> = ({
  label,
  className = "",
  ...props
}) => {
  return (
    <div className="w-full">
      {label && (
        <label className="block text-xs font-medium text-zinc-500 uppercase tracking-wider mb-2">
          {label}
        </label>
      )}
      <input
        className={`w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-zinc-200 focus:outline-none focus:border-orange-500 transition-colors max-md:px-2 max-md:py-2 ${className}`}
        {...props}
      />
    </div>
  );
};
