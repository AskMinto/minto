"use client";

import { Card } from "@/components/ui/card";
import { formatCurrency, formatPct } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { classifyFund, fundTypeLabel, fundTypeVariant } from "@/lib/fund-classifier";

interface MFHolding {
  id?: string;
  scheme_name?: string;
  scheme_code?: number;
  qty: number;
  value: number;
  pnl_pct: number;
  current_price?: number;
}

export function MFHoldingsTable({ holdings }: { holdings: MFHolding[] }) {
  if (!holdings.length) return null;

  return (
    <Card>
      <h3 className="font-bold text-minto-text mb-4">Mutual Funds</h3>
      <div className="space-y-2">
        {holdings.map((h) => {
          const pnlColor = (h.pnl_pct || 0) >= 0 ? "text-minto-positive" : "text-minto-negative";
          const fundType = classifyFund({ schemeName: h.scheme_name });
          return (
            <div key={h.id || h.scheme_code} className="flex items-center justify-between py-2 border-b border-black/5 last:border-0">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-minto-text truncate">
                  {h.scheme_name || "Mutual Fund"}
                </p>
                <div className="flex flex-wrap items-center gap-2 text-xs text-minto-text-muted">
                  <span>
                    {h.qty} units · NAV ₹{h.current_price?.toFixed(2) ?? "—"}
                  </span>
                  {fundType ? (
                    <Badge variant={fundTypeVariant(fundType)}>
                      {fundTypeLabel(fundType)}
                    </Badge>
                  ) : null}
                </div>
              </div>
              <div className="text-right ml-3">
                <p className="text-sm font-bold text-minto-text">{formatCurrency(h.value)}</p>
                <p className={`text-xs font-medium ${pnlColor}`}>{formatPct(h.pnl_pct || 0)}</p>
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}
