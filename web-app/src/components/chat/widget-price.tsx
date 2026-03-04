"use client";

import { useState } from "react";
import { TrendingUp, TrendingDown, X } from "lucide-react";

interface PriceItem {
  symbol?: string;
  scheme_name?: string;
  price?: number;
  nav?: number;
  change?: number;
  change_pct?: number;
  type: "equity" | "mf";
}

const MAX_VISIBLE = 3;

function PriceChip({ item }: { item: PriceItem }) {
  const label = item.type === "equity" ? item.symbol : (item.scheme_name || "MF");
  const shortLabel = label && label.length > 20 ? label.slice(0, 18) + "…" : label;
  const value = item.type === "equity"
    ? `₹${item.price?.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
    : `NAV ₹${item.nav?.toFixed(2)}`;
  const hasChange = item.change != null && item.change_pct != null;
  const isUp = (item.change ?? 0) >= 0;
  const Icon = isUp ? TrendingUp : TrendingDown;
  const changeColor = isUp ? "text-minto-positive" : "text-minto-negative";

  return (
    <div className="glass-card flex items-center gap-2 px-3 py-2 text-xs">
      <div className={`w-6 h-6 rounded-lg flex items-center justify-center ${isUp ? "bg-minto-positive/10" : "bg-minto-negative/10"}`}>
        <Icon size={12} className={changeColor} />
      </div>
      <div className="min-w-0">
        <p className="font-semibold text-minto-text truncate">{shortLabel}</p>
        <div className="flex items-center gap-1.5">
          <span className="text-minto-text-secondary font-medium">{value}</span>
          {hasChange && (
            <span className={`${changeColor} font-medium`}>
              {isUp ? "+" : ""}{item.change_pct!.toFixed(2)}%
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

export function WidgetPrice({ data }: { data: { items: PriceItem[] } }) {
  const [open, setOpen] = useState(false);
  const items = data?.items || [];
  if (!items.length) return null;

  const visible = items.slice(0, MAX_VISIBLE);
  const remaining = items.length - MAX_VISIBLE;

  return (
    <>
      <div className="flex flex-wrap items-center gap-2 mt-2 mb-2">
        {visible.map((item, i) => (
          <PriceChip key={i} item={item} />
        ))}
        {remaining > 0 && (
          <button
            onClick={() => setOpen(true)}
            className="glass-card px-3 py-2 text-xs font-bold text-minto-accent hover:bg-white/70 transition-colors cursor-pointer"
          >
            +{remaining} more
          </button>
        )}
      </div>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" onClick={() => setOpen(false)}>
          <div className="absolute inset-0 bg-black/35" />
          <div
            className="relative bg-[#f2f5ef] rounded-2xl shadow-xl w-full max-w-md max-h-[70vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between p-4 border-b border-black/5">
              <h3 className="text-sm font-bold text-minto-text">Price Lookups</h3>
              <button onClick={() => setOpen(false)} className="w-7 h-7 rounded-full bg-black/5 flex items-center justify-center hover:bg-black/10">
                <X size={14} />
              </button>
            </div>
            <div className="p-4 space-y-2">
              {items.map((item, i) => {
                const label = item.type === "equity" ? item.symbol : (item.scheme_name || "MF");
                const value = item.type === "equity"
                  ? `₹${item.price?.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                  : `NAV ₹${item.nav?.toFixed(2)}`;
                const hasChange = item.change != null && item.change_pct != null;
                const isUp = (item.change ?? 0) >= 0;
                const Icon = isUp ? TrendingUp : TrendingDown;
                const changeColor = isUp ? "text-minto-positive" : "text-minto-negative";
                const changeBg = isUp ? "bg-minto-positive/8" : "bg-minto-negative/8";

                return (
                  <div key={i} className="flex items-center gap-3 p-3 rounded-xl bg-white/50">
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${isUp ? "bg-minto-positive/10" : "bg-minto-negative/10"}`}>
                      <Icon size={14} className={changeColor} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-minto-text truncate">{label}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-sm text-minto-text-secondary font-medium">{value}</span>
                        {hasChange && (
                          <span className={`text-xs font-bold ${changeColor} ${changeBg} px-1.5 py-0.5 rounded`}>
                            {isUp ? "↑" : "↓"} {isUp ? "+" : ""}{item.change_pct!.toFixed(2)}%
                            ({isUp ? "+" : ""}{item.change!.toFixed(2)})
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
