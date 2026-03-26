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
        className={`w-full bg-white/5 border border-white/5 rounded-gr-3 px-gr-4 py-gr-3 text-zinc-200 focus:outline-none focus:border-primary/50 focus:bg-white/10 focus:shadow-[0_0_15px_rgba(var(--primary),0.1)] transition-all smooth-transition ${className}`}
        {...props}
      />
    </div>
  );
};
