import React from "react";

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "danger" | "ghost";
  size?: "sm" | "md" | "lg";
  fullWidth?: boolean;
  children: React.ReactNode;
}

export const Button: React.FC<ButtonProps> = ({
  variant = "primary",
  size = "md",
  fullWidth = false,
  children,
  className = "",
  disabled = false,
  ...props
}) => {
  const baseStyles =
    "inline-flex items-center justify-center font-bold rounded-gr-3 transition-all !outline-none disabled:opacity-50 disabled:cursor-not-allowed shadow-sm hover:shadow-md smooth-transition";

  const variantStyles = {
    primary: "premium-gradient text-white shadow-primary/20",
    secondary:
      "bg-white/5 hover:bg-white/10 text-zinc-300 border border-white/5",
    danger:
      "bg-red-500/10 text-red-500 hover:bg-red-500/20 border border-red-500/20",
    ghost:
      "bg-transparent hover:bg-white/5 text-zinc-400 hover:text-foreground",
  };

  const sizeStyles = {
    sm: "min-h-7 px-gr-3 py-gr-1 text-[10px]",
    md: "min-h-9 px-gr-4 py-gr-2 text-xs",
    lg: "min-h-11 px-gr-5 py-gr-3 text-sm",
  };

  const widthStyle = fullWidth ? "w-full" : "";

  return (
    <button
      className={`${baseStyles} ${variantStyles[variant]} ${sizeStyles[size]} ${widthStyle} ${className}`}
      disabled={disabled}
      {...props}
    >
      {children}
    </button>
  );
};
