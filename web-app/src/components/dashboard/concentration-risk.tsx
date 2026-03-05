"use client";

import {
  AlertTriangle,
  TrendingDown,
  PieChart,
  Layers,
  GitMerge,
  DollarSign,
  Briefcase,
  Sparkles,
  CheckCircle2,
  Lightbulb,
} from "lucide-react";
import { Spinner } from "@/components/ui/spinner";
import type { RiskAnalysis, ConcentrationFlag } from "@/hooks/use-dashboard";

interface Props {
  analysis: RiskAnalysis | null;
  analyzing?: boolean;
  riskError?: string | null;
}

const TYPE_ICON: Record<string, typeof TrendingDown> = {
  stock: TrendingDown,
  sector: PieChart,
  top_concentration: Layers,
  overlap: GitMerge,
  currency: DollarSign,
  esop: Briefcase,
};

function riskScoreColor(level: RiskAnalysis["risk_level"]): string {
  switch (level) {
    case "low":
      return "bg-minto-positive text-white";
    case "moderate":
      return "bg-minto-gold text-white";
    case "high":
      return "bg-orange-500 text-white";
    case "very_high":
      return "bg-minto-negative text-white";
  }
}

function severityStyles(severity: ConcentrationFlag["severity"]) {
  switch (severity) {
    case "red":
      return {
        card: "bg-minto-negative/5 border-minto-negative/20",
        icon: "bg-minto-negative/10 text-minto-negative",
        pct: "text-minto-negative",
      };
    case "yellow":
      return {
        card: "bg-minto-gold/5 border-minto-gold/20",
        icon: "bg-minto-gold/15 text-minto-gold",
        pct: "text-minto-gold",
      };
    case "green":
      return {
        card: "bg-minto-positive/5 border-minto-positive/20",
        icon: "bg-minto-positive/10 text-minto-positive",
        pct: "text-minto-positive",
      };
  }
}

function riskLevelLabel(level: RiskAnalysis["risk_level"]): string {
  switch (level) {
    case "low":
      return "Low";
    case "moderate":
      return "Moderate";
    case "high":
      return "High";
    case "very_high":
      return "Very High";
  }
}

export function ConcentrationRisk({ analysis, analyzing, riskError }: Props) {
  /* Loading state */
  if (analyzing) {
    return (
      <div className="glass-card p-8 flex flex-col items-center justify-center gap-3">
        <Spinner size={24} />
        <p className="text-sm text-minto-text-secondary">Analyzing portfolio risks…</p>
      </div>
    );
  }

  /* Error state */
  if (riskError) {
    return (
      <div className="glass-card p-8 flex flex-col items-center justify-center gap-2 text-center">
        <AlertTriangle size={20} className="text-minto-negative" />
        <p className="text-sm text-minto-negative">{riskError}</p>
      </div>
    );
  }

  /* Empty state — never analyzed */
  if (!analysis) {
    return (
      <div className="glass-card p-8 flex flex-col items-center justify-center gap-2 text-center">
        <Sparkles size={20} className="text-minto-text-muted" />
        <p className="text-sm text-minto-text-muted">
          Click &quot;Analyze Risk&quot; to run AI portfolio analysis
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header row: title + risk score badge */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <AlertTriangle size={16} className="text-minto-text" />
          <h4 className="text-sm font-bold text-minto-text">Risk Analysis</h4>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-minto-text-secondary">{riskLevelLabel(analysis.risk_level)}</span>
          <div
            className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${riskScoreColor(analysis.risk_level)}`}
          >
            {Math.round(analysis.risk_score)}
          </div>
        </div>
      </div>

      {/* Summary */}
      <p className="text-sm text-minto-text-secondary leading-relaxed">{analysis.summary}</p>

      {/* Concentration flags */}
      {analysis.concentration_flags.length > 0 && (
        <div className="space-y-2.5">
          {analysis.concentration_flags.map((flag, i) => {
            const styles = severityStyles(flag.severity);
            const Icon = TYPE_ICON[flag.type] || AlertTriangle;
            return (
              <div
                key={`${flag.type}-${flag.label}-${i}`}
                className={`rounded-2xl p-4 border flex gap-3 ${styles.card}`}
              >
                <div
                  className={`mt-0.5 flex-shrink-0 w-7 h-7 rounded-full flex items-center justify-center ${styles.icon}`}
                >
                  <Icon size={14} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline justify-between gap-2">
                    <p className="text-sm font-semibold text-minto-text truncate">
                      {flag.label}
                    </p>
                    {flag.pct != null && (
                      <span className={`text-xs font-bold flex-shrink-0 ${styles.pct}`}>
                        {flag.pct.toFixed(1)}%
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-minto-text-secondary mt-1 leading-relaxed">
                    {flag.why}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Diversification notes */}
      {analysis.diversification_notes.length > 0 && (
        <div className="space-y-2">
          <h5 className="text-xs font-semibold text-minto-text-muted uppercase tracking-wide">
            Diversification
          </h5>
          <div className="space-y-1.5">
            {analysis.diversification_notes.map((note, i) => (
              <div
                key={i}
                className="rounded-xl p-3 bg-minto-positive/5 border border-minto-positive/15 flex gap-2.5"
              >
                <CheckCircle2 size={14} className="text-minto-positive flex-shrink-0 mt-0.5" />
                <p className="text-xs text-minto-text-secondary leading-relaxed">{note}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recommendations */}
      {analysis.recommendations.length > 0 && (
        <div className="space-y-2">
          <h5 className="text-xs font-semibold text-minto-text-muted uppercase tracking-wide">
            Recommendations
          </h5>
          <div className="space-y-1.5">
            {analysis.recommendations.map((rec, i) => (
              <div key={i} className="flex gap-2.5 pl-1">
                <Lightbulb size={13} className="text-minto-gold flex-shrink-0 mt-0.5" />
                <p className="text-xs text-minto-text-secondary leading-relaxed">{rec}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
