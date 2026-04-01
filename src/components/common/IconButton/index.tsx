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
    "rounded-gr-1 transition-all outline-none focus:outline-none focus:ring-0 focus-visible:outline-none flex items-center justify-center smooth-transition";

  const variantStyles = {
    default: "bg-transparent hover:bg-white/10 text-zinc-400 hover:text-foreground",
    danger:
      "bg-transparent hover:bg-red-500/10 text-zinc-500 hover:text-red-400",
    primary: "premium-gradient text-white hover:opacity-90 shadow-lg shadow-primary/20",
  };

  const sizeStyles = {
    sm: "p-gr-1",
    md: "p-gr-2",
    lg: "p-gr-3",
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
