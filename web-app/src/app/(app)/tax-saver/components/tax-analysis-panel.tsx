"use client";

import { TrendingDown, Download, ChevronRight } from "lucide-react";
import { TaxSessionState } from "@/hooks/use-tax-chat";

interface Props {
  sessionState: TaxSessionState;
  onDownloadReport: () => void;
  onViewAnalysis: () => void;
}

function fmt(n: number | null | undefined): string {
  if (n == null) return "—";
  return `₹${n.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
}

export function TaxAnalysisPanel({ sessionState, onDownloadReport, onViewAnalysis }: Props) {
  if (!sessionState.has_tax_analysis) return null;

  const taxLiability = sessionState.total_tax ?? 0;
  const exemptionRemaining = sessionState.exemption_remaining ?? 0;

  return (
    <div className="px-4 py-2 border-b border-white/20">
      <div className="max-w-5xl mx-auto">
        <div className="glass-subtle rounded-2xl px-4 py-3 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-minto-accent/15 flex items-center justify-center shrink-0">
              <TrendingDown size={16} className="text-minto-accent" />
            </div>
            <div>
              <p className="text-xs text-minto-text-muted font-medium uppercase tracking-wide mb-0.5">
                Tax Summary · FY 2025-26
              </p>
              <div className="flex items-center gap-4 text-sm">
                <span className="text-minto-text">
                  Liability:{" "}
                  <span
                    className={
                      taxLiability === 0
                        ? "text-minto-positive font-semibold"
                        : "text-minto-negative font-semibold"
                    }
                  >
                    {fmt(taxLiability)}
                  </span>
                </span>
                {exemptionRemaining > 0 && (
                  <span className="text-minto-text-secondary">
                    Exemption remaining:{" "}
                    <span className="font-semibold text-minto-text">
                      {fmt(exemptionRemaining)}
                    </span>
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={onViewAnalysis}
              className="flex items-center gap-1 text-xs text-minto-accent hover:underline"
            >
              View analysis <ChevronRight size={12} />
            </button>
            <button
              onClick={onDownloadReport}
              className="flex items-center gap-1.5 text-xs glass-card px-3 py-1.5 rounded-full hover:bg-white/60 transition-colors"
            >
              <Download size={12} />
              PDF
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
