import { InputHTMLAttributes, forwardRef } from "react";
import { clsx } from "clsx";

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, className, ...props }, ref) => (
    <div className="w-full">
      {label && (
        <label className="block text-xs font-medium text-minto-text-muted mb-1.5">
          {label}
        </label>
      )}
      <input
        ref={ref}
        className={clsx(
          "w-full bg-white/60 border border-white/30 rounded-2xl px-4 py-3 text-sm text-minto-text placeholder:text-minto-text-muted focus:outline-none focus:ring-2 focus:ring-minto-accent/30 transition-all",
          error && "ring-2 ring-minto-negative/30",
          className
        )}
        {...props}
      />
      {error && (
        <p className="text-xs text-minto-negative mt-1">{error}</p>
      )}
    </div>
  )
);

Input.displayName = "Input";
