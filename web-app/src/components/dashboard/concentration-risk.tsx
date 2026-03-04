"use client";

import { AlertTriangle, TrendingDown, PieChart, Layers } from "lucide-react";

interface Flag {
  type: string;
  label: string;
  pct: number;
  severity: string;
  why: string;
}

const TYPE_ICON: Record<string, typeof TrendingDown> = {
  stock: TrendingDown,
  sector: PieChart,
  top3: Layers,
};

export function ConcentrationRisk({ flags }: { flags: Flag[] }) {
  if (!flags.length) return null;

  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <AlertTriangle size={16} className="text-minto-text" />
        <h4 className="text-sm font-bold text-minto-text">Concentration Risk</h4>
      </div>
      <div className="space-y-2.5">
        {flags.map((flag) => {
          const isRed = flag.severity === "red";
          const Icon = TYPE_ICON[flag.type] || AlertTriangle;
          return (
            <div
              key={`${flag.type}-${flag.label}`}
              className={`rounded-2xl p-4 border flex gap-3 ${
                isRed
                  ? "bg-minto-negative/5 border-minto-negative/20"
                  : "bg-minto-gold/5 border-minto-gold/20"
              }`}
            >
              <div
                className={`mt-0.5 flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center ${
                  isRed
                    ? "bg-minto-negative/10 text-minto-negative"
                    : "bg-minto-gold/15 text-minto-gold"
                }`}
              >
                <Icon size={14} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-baseline justify-between gap-2">
                  <p className="text-sm font-semibold text-minto-text truncate">
                    {flag.label}
                  </p>
                  <span
                    className={`text-xs font-bold flex-shrink-0 ${
                      isRed ? "text-minto-negative" : "text-minto-gold"
                    }`}
                  >
                    {flag.pct.toFixed(1)}%
                  </span>
                </div>
                <p className="text-xs text-minto-text-secondary mt-1 leading-relaxed">
                  {flag.why}
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
