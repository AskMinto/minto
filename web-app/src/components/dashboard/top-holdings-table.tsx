"use client";

import { Card } from "@/components/ui/card";
import { formatCurrency, formatPct } from "@/lib/format";
import Link from "next/link";

interface Holding {
  id?: string;
  symbol?: string;
  scheme_name?: string;
  scheme_code?: number;
  qty: number;
  value: number;
  pnl_pct: number;
  exchange?: string;
}

export function TopHoldingsTable({ holdings }: { holdings: Holding[] }) {
  if (!holdings.length) return null;

  return (
    <Card>
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-bold text-minto-text">Top Holdings</h3>
        <Link href="/holdings" className="text-xs font-medium text-minto-accent hover:underline">
          View All →
        </Link>
      </div>
      <div className="space-y-2">
        {holdings.map((h) => {
          const pnlColor = (h.pnl_pct || 0) >= 0 ? "text-minto-positive" : "text-minto-negative";
          return (
            <div key={h.id || h.symbol || h.scheme_name} className="flex items-center justify-between py-2 border-b border-black/5 last:border-0">
              <div>
                <p className="text-sm font-medium text-minto-text">
                  {h.symbol || h.scheme_name || "Holding"}
                </p>
                <p className="text-xs text-minto-text-muted">
                  {h.qty} {h.scheme_code ? "units" : "shares"}
                </p>
              </div>
              <div className="text-right">
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
