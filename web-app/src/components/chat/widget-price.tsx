"use client";

import { TrendingUp } from "lucide-react";

interface PriceItem {
  symbol?: string;
  scheme_name?: string;
  price?: number;
  nav?: number;
  type: "equity" | "mf";
}

export function WidgetPrice({ data }: { data: { items: PriceItem[] } }) {
  const items = data?.items || [];
  if (!items.length) return null;

  return (
    <div className="flex flex-wrap gap-2 mt-2 mb-2">
      {items.map((item, i) => {
        const label = item.type === "equity" ? item.symbol : item.scheme_name || "MF";
        const value = item.type === "equity" ? `₹${item.price?.toFixed(2)}` : `NAV ₹${item.nav?.toFixed(4)}`;
        return (
          <div key={i} className="glass-card flex items-center gap-2 px-3 py-2 text-xs">
            <div className="w-6 h-6 rounded-lg bg-minto-accent/10 flex items-center justify-center">
              <TrendingUp size={12} className="text-minto-accent" />
            </div>
            <div>
              <p className="font-medium text-minto-text truncate max-w-[150px]">{label}</p>
              <p className="text-minto-text-muted">{value}</p>
            </div>
          </div>
        );
      })}
    </div>
  );
}
