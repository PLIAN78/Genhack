import React from "react";
import { Loader2 } from "lucide-react";

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "transparent" | "danger";
  size?: "default" | "sm" | "lg" | "full";
  isLoading?: boolean;
  leftIcon?: React.ReactNode;
}

export function Button({
  className = "",
  variant = "primary",
  size = "default",
  isLoading = false,
  leftIcon,
  children,
  disabled,
  ...props
}: ButtonProps) {
  // Map FinUI variants to our global CSS classes or Tailwind utilities
  const variantClasses = {
    primary: "fin-button-primary",
    secondary: "fin-button-secondary",
    transparent: "bg-transparent text-primary-400 hover:text-primary-300 hover:bg-primary-900/30 transition-colors",
    danger: "bg-red-600/90 text-white hover:bg-red-500 active:bg-red-700 shadow-[0_0_15px_rgba(220,38,38,0.3)] transition-all",
  };

  const sizeClasses = {
    default: "px-4 py-2 text-sm",
    sm: "px-3 py-1.5 text-xs",
    lg: "px-6 py-3 text-base",
    full: "w-full px-4 py-2 text-sm",
  };

  const isDisabled = disabled || isLoading;

  return (
    <button
      disabled={isDisabled}
      className={`
        inline-flex items-center justify-center font-medium rounded-lg
        ${variantClasses[variant]}
        ${sizeClasses[size]}
        ${isDisabled ? "opacity-50 cursor-not-allowed hover:shadow-none active:bg-inherit" : ""}
        ${className}
      `}
      {...props}
    >
      {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
      {!isLoading && leftIcon && <span className="mr-2">{leftIcon}</span>}
      {children}
    </button>
  );
}
