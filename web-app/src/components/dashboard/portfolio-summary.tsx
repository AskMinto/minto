"use client";

import { Card } from "@/components/ui/card";
import { formatCurrency, formatPct } from "@/lib/format";

interface Props {
  totals: {
    total_value: number;
    invested: number;
    pnl: number;
    pnl_pct: number;
    today_pnl: number;
  };
}

export function PortfolioSummary({ totals }: Props) {
  const pnlColor = totals.pnl >= 0 ? "text-minto-positive" : "text-minto-negative";
  const todayColor = totals.today_pnl >= 0 ? "text-minto-positive" : "text-minto-negative";

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      <Card className="text-center">
        <p className="text-xs font-medium text-minto-text-muted mb-1">Total Value</p>
        <p className="text-2xl font-bold text-minto-text">{formatCurrency(totals.total_value)}</p>
      </Card>
      <Card className="text-center">
        <p className="text-xs font-medium text-minto-text-muted mb-1">Invested</p>
        <p className="text-2xl font-bold text-minto-text">{formatCurrency(totals.invested)}</p>
      </Card>
      <Card className="text-center">
        <p className="text-xs font-medium text-minto-text-muted mb-1">P&L</p>
        <p className={`text-2xl font-bold ${pnlColor}`}>{formatCurrency(totals.pnl)}</p>
        <p className={`text-xs font-medium ${pnlColor}`}>{formatPct(totals.pnl_pct)}</p>
      </Card>
      <Card className="text-center">
        <p className="text-xs font-medium text-minto-text-muted mb-1">Today</p>
        <p className={`text-2xl font-bold ${todayColor}`}>{formatCurrency(totals.today_pnl)}</p>
      </Card>
    </div>
  );
}
