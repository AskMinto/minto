import { clsx } from "clsx";

export function Spinner({ className, size = 20 }: { className?: string; size?: number }) {
  return (
    <span
      className={clsx("inline-block border-2 border-minto-accent border-t-transparent rounded-full animate-spin", className)}
      style={{ width: size, height: size }}
    />
  );
}
