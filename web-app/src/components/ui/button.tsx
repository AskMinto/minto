import { ButtonHTMLAttributes, forwardRef } from "react";
import { clsx } from "clsx";

type Variant = "primary" | "secondary" | "destructive" | "ghost";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: "sm" | "md" | "lg";
}

const variants: Record<Variant, string> = {
  primary:
    "bg-minto-accent text-white hover:opacity-90",
  secondary:
    "bg-minto-accent/10 text-minto-accent hover:bg-minto-accent/20",
  destructive:
    "bg-minto-negative/10 text-minto-negative border border-minto-negative/20 hover:bg-minto-negative/20",
  ghost:
    "text-minto-text-secondary hover:bg-black/5",
};

const sizes = {
  sm: "px-3 py-1.5 text-xs rounded-lg",
  md: "px-5 py-2.5 text-sm rounded-full",
  lg: "px-8 py-3.5 text-base rounded-full",
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = "primary", size = "md", className, children, ...props }, ref) => (
    <button
      ref={ref}
      className={clsx(
        "font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center justify-center gap-2",
        variants[variant],
        sizes[size],
        className
      )}
      {...props}
    >
      {children}
    </button>
  )
);

Button.displayName = "Button";
