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
    "font-medium rounded-xl transition-all outline-none disabled:opacity-50 disabled:cursor-not-allowed";

  const variantStyles = {
    primary:
      "bg-orange-500 hover:bg-orange-600 text-white shadow-lg shadow-orange-500/20",
    secondary: "bg-zinc-800 hover:bg-zinc-700 text-zinc-300",
    danger: "bg-red-500/10 text-red-500 hover:bg-red-500/20",
    ghost: "bg-transparent hover:bg-zinc-800 text-zinc-400 hover:text-white",
  };

  const sizeStyles = {
    sm: "px-3 py-1.5 text-xs",
    md: "px-4 py-2 text-sm",
    lg: "px-6 py-3 text-base",
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
