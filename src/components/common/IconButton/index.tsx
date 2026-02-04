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
    "rounded-md transition-all outline-none flex items-center justify-center";

  const variantStyles = {
    default: "bg-transparent hover:bg-zinc-800 text-zinc-400 hover:text-white",
    danger:
      "bg-transparent hover:bg-red-500/20 text-zinc-500 hover:text-red-400",
    primary: "bg-orange-500 text-white hover:bg-orange-600",
  };

  const sizeStyles = {
    sm: "p-0.5",
    md: "p-1.5",
    lg: "p-2",
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
