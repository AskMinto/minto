"use client";

import { AlertTriangle } from "lucide-react";

interface Flag {
  type: string;
  label: string;
  pct: number;
  severity: string;
  why: string;
}

export function ConcentrationRisk({ flags }: { flags: Flag[] }) {
  if (!flags.length) return null;

  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <AlertTriangle size={16} className="text-minto-text" />
        <h4 className="text-sm font-bold text-minto-text">Concentration Risk</h4>
      </div>
      <div className="space-y-2">
        {flags.map((flag) => {
          const isRed = flag.severity === "red";
          return (
            <div
              key={`${flag.type}-${flag.label}`}
              className={`rounded-2xl p-4 border ${
                isRed
                  ? "bg-minto-negative/5 border-minto-negative/20"
                  : "bg-minto-gold/5 border-minto-gold/20"
              }`}
            >
              <p className="text-sm font-medium text-minto-text">{flag.label}</p>
              <p className="text-xs text-minto-text-muted mt-0.5">
                {flag.pct.toFixed(1)}% exposure
              </p>
              <p className="text-xs text-minto-text-secondary mt-1.5 leading-relaxed">
                {flag.why}
              </p>
            </div>
          );
        })}
      </div>
    </div>
  );
}
