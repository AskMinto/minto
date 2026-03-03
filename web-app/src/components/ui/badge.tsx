import { clsx } from "clsx";

type BadgeVariant =
  | "equity"
  | "mf"
  | "red"
  | "yellow"
  | "green"
  | "default"
  | "fund-index"
  | "fund-equity"
  | "fund-debt"
  | "fund-arbitrage"
  | "fund-gold"
  | "fund-silver";

const variants: Record<BadgeVariant, string> = {
  equity: "bg-minto-accent/12 text-minto-accent",
  mf: "bg-minto-gold/12 text-minto-gold",
  red: "bg-minto-negative/10 text-minto-negative",
  yellow: "bg-minto-gold/12 text-minto-gold",
  green: "bg-minto-positive/12 text-minto-positive",
  default: "bg-black/5 text-minto-text-secondary",
  "fund-index": "bg-minto-accent/10 text-minto-accent",
  "fund-equity": "bg-minto-accent/10 text-minto-accent",
  "fund-debt": "bg-black/5 text-minto-text-secondary",
  "fund-arbitrage": "bg-minto-gold/12 text-minto-gold",
  "fund-gold": "bg-minto-gold/12 text-minto-gold",
  "fund-silver": "bg-black/5 text-minto-text-secondary",
};

export function Badge({
  variant = "default",
  children,
  className,
}: {
  variant?: BadgeVariant;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      className={clsx(
        "inline-flex items-center px-2.5 py-0.5 rounded-lg text-xs font-medium",
        variants[variant],
        className
      )}
    >
      {children}
    </span>
  );
}
