import React from "react";

interface IconButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  icon: React.ReactNode;
  variant?: "default" | "danger" | "primary";
  size?: "sm" | "md" | "lg";
}

export const IconButton: React.FC<IconButtonProps> = ({
  icon,
  variant = "default",
  size = "md",
  className = "",
  ...props
}) => {
  const baseStyles =
    "inline-flex items-center justify-center rounded-gr-2 transition-all outline-none disabled:opacity-50 disabled:cursor-not-allowed smooth-transition";

  const variantStyles = {
    default: "bg-transparent hover:bg-white/10 text-zinc-400 hover:text-foreground",
    danger:
      "bg-transparent hover:bg-red-500/10 text-zinc-500 hover:text-red-400",
    primary: "premium-gradient text-white hover:opacity-90 shadow-lg shadow-primary/20",
  };

  const sizeStyles = {
    sm: "h-6 w-6",
    md: "h-8 w-8",
    lg: "h-10 w-10",
  };

  return (
    <button
      className={`${baseStyles} ${variantStyles[variant]} ${sizeStyles[size]} ${className}`}
      {...props}
    >
      {icon}
    </button>
  );
};
