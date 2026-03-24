"use client";

import { TrendingDown, TrendingUp, Shield, AlertTriangle, CheckCircle, Info } from "lucide-react";
import type { AnalysisPayload, LossCandidate, GainsCandidate } from "@/hooks/use-tax-harvest";

interface Props {
  payload: AnalysisPayload;
}

function formatINR(amount: number | null | undefined): string {
  if (amount == null) return "—";
  const abs = Math.abs(amount);
  const formatted = new Intl.NumberFormat("en-IN", {
    maximumFractionDigits: 0,
  }).format(abs);
  return (amount < 0 ? "-" : "") + "₹" + formatted;
}

function PriorityBadge({ priority }: { priority: "HIGH" | "MEDIUM" | "LOW" | string }) {
  const styles: Record<string, string> = {
    HIGH: "bg-red-100 text-red-700",
    MEDIUM: "bg-amber-100 text-amber-700",
    LOW: "bg-green-100 text-green-700",
  };
  return (
    <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full uppercase ${styles[priority] || "bg-gray-100 text-gray-600"}`}>
      {priority}
    </span>
  );
}

function SummaryMetric({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[11px] text-minto-text-muted uppercase tracking-wide">{label}</span>
      <span className={`text-base font-semibold ${highlight ? "text-minto-accent" : "text-minto-text"}`}>
        {value}
      </span>
    </div>
  );
}

export function TaxAnalysisCard({ payload }: Props) {
  const totalTax = payload.total_tax ?? 0;
  const exemptionRemaining = payload.exemption_remaining ?? 0;
  const exemptionUsed = payload.exemption_used ?? 0;
  const savings = payload.optimal_vs_naive_saving ?? 0;
  const lossesHarvestable = [
    ...(payload.loss_harvest_mf || []),
    ...(payload.loss_harvest_stocks || []),
  ].filter((l) => !l.excluded);
  const gainsHarvestable = payload.gains_harvest_mf || [];
  const warnings = payload.warnings || [];

  const regimeLabel = payload.tax_regime === "new" ? "New Regime" : "Old Regime";
  const slabLabel = payload.income_slab ? `${payload.income_slab} slab` : "";

  return (
    <div className="w-full max-w-2xl space-y-4 mt-2">
      {/* Warnings */}
      {warnings.length > 0 && (
        <div className="glass-card rounded-2xl p-4 border border-amber-200/60 bg-amber-50/40">
          {warnings.map((w, i) => (
            <div key={i} className="flex items-start gap-2 text-sm text-amber-800">
              <AlertTriangle size={14} className="shrink-0 mt-0.5 text-amber-600" />
              <span>{w}</span>
            </div>
          ))}
        </div>
      )}

      {/* Tax Summary Card */}
      <div className="glass-card rounded-2xl p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-minto-text text-base">
            Tax Summary — FY {payload.tax_year || "2025-26"}
          </h3>
          <div className="flex gap-2">
            {regimeLabel && (
              <span className="text-[11px] bg-minto-accent/10 text-minto-accent px-2 py-0.5 rounded-full font-medium">
                {regimeLabel}
              </span>
            )}
            {slabLabel && (
              <span className="text-[11px] bg-minto-text-muted/10 text-minto-text-muted px-2 py-0.5 rounded-full">
                {slabLabel}
              </span>
            )}
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          <SummaryMetric
            label="Total Tax Liability"
            value={formatINR(totalTax)}
            highlight={totalTax > 0}
          />
          <SummaryMetric
            label="Exemption Used"
            value={formatINR(exemptionUsed)}
          />
          <SummaryMetric
            label="Exemption Remaining"
            value={formatINR(exemptionRemaining)}
            highlight={exemptionRemaining > 0}
          />
        </div>

        {savings > 0 && (
          <div className="flex items-center gap-2 bg-green-50/60 border border-green-200/60 rounded-xl px-4 py-2.5">
            <Shield size={14} className="text-green-600 shrink-0" />
            <span className="text-sm text-green-800">
              Smart CF allocation saved you <strong>{formatINR(savings)}</strong> in tax vs. naive ordering
            </span>
          </div>
        )}

        {/* Realised gains breakdown */}
        {payload.realised && (
          <div className="space-y-2">
            <div className="text-xs text-minto-text-muted font-medium uppercase tracking-wide">Realised Gains & Losses</div>
            <div className="grid grid-cols-2 gap-x-6 gap-y-1.5 text-sm">
              {[
                ["Equity LTCG", (payload.realised as Record<string, number>)?.eq_ltcg],
                ["Equity STCG", (payload.realised as Record<string, number>)?.eq_stcg],
                ["Equity LTCL", (payload.realised as Record<string, number>)?.eq_ltcl],
                ["Equity STCL", (payload.realised as Record<string, number>)?.eq_stcl],
                ["Non-equity STCG", (payload.realised as Record<string, number>)?.noneq_stcg],
                ["Non-equity LTCG", (payload.realised as Record<string, number>)?.noneq_ltcg],
              ]
                .filter(([, v]) => v != null && (v as number) !== 0)
                .map(([label, value]) => (
                  <div key={label as string} className="flex justify-between">
                    <span className="text-minto-text-muted">{label as string}</span>
                    <span className="font-medium text-minto-text">{formatINR(value as number)}</span>
                  </div>
                ))}
            </div>
          </div>
        )}

        <div className="text-[11px] text-minto-text-muted">
          ⚠️ Surcharge and 4% cess are not included. Consult a CA for your final liability.
        </div>
      </div>

      {/* Loss Harvesting Card */}
      {lossesHarvestable.length > 0 && (
        <div className="glass-card rounded-2xl p-5 space-y-3 border border-red-200/40">
          <div className="flex items-center gap-2">
            <TrendingDown size={16} className="text-red-500" />
            <h3 className="font-semibold text-minto-text text-base">Loss Harvesting Plan</h3>
          </div>
          <p className="text-xs text-minto-text-muted">
            Sell these positions before March 31 to realise losses and offset your gains.
            Reinvest the same day — no wash-sale rule in India.
          </p>
          <div className="space-y-2">
            {lossesHarvestable.map((c, i) => (
              <LossCandidateRow key={i} candidate={c} />
            ))}
          </div>
          {(payload.loss_harvest_mf || []).filter((l) => l.excluded).length > 0 && (
            <div className="text-xs text-minto-text-muted flex items-start gap-1.5 mt-1">
              <Info size={12} className="shrink-0 mt-0.5" />
              <span>
                Some funds excluded due to Sec 94(7)/94(8) bonus/dividend stripping rules.
              </span>
            </div>
          )}
        </div>
      )}

      {/* Gains Harvesting Card */}
      {exemptionRemaining > 0 && gainsHarvestable.length > 0 && (
        <div className="glass-card rounded-2xl p-5 space-y-3 border border-green-200/40">
          <div className="flex items-center gap-2">
            <TrendingUp size={16} className="text-green-600" />
            <h3 className="font-semibold text-minto-text text-base">
              Gains Harvesting Plan
            </h3>
          </div>
          <p className="text-xs text-minto-text-muted">
            Book up to <strong>{formatINR(exemptionRemaining)}</strong> in LTCG tax-free using your remaining ₹1.25L exemption.
            Sell before March 31 and reinvest on April 1, 2026.
          </p>
          <div className="space-y-2">
            {gainsHarvestable.map((c, i) => (
              <GainsCandidateRow key={i} candidate={c} target={exemptionRemaining} />
            ))}
          </div>
        </div>
      )}

      {/* ITR reminder */}
      <div className="glass-subtle rounded-xl p-3.5 flex items-start gap-2.5">
        <CheckCircle size={15} className="text-minto-accent shrink-0 mt-0.5" />
        <div className="text-xs text-minto-text-muted">
          <strong className="text-minto-text">ITR Filing Reminder:</strong> File ITR-2 or ITR-3 (not ITR-1)
          before <strong>July 31, 2026</strong> to carry forward capital losses to FY 2026-27.
        </div>
      </div>
    </div>
  );
}

function LossCandidateRow({ candidate }: { candidate: LossCandidate }) {
  const name = candidate.fund_name || candidate.scrip_name || "Unknown";
  const lossType = candidate.loss_type || (candidate.is_equity_oriented ? "STCL" : "STCL");
  const loss = Math.abs(candidate.unrealised_loss || 0);
  const taxSaved = candidate.tax_saved || 0;
  const days = candidate.holding_days;
  const exitLoad = candidate.exit_load_pct || 0;

  return (
    <div className="flex items-start justify-between bg-white/50 rounded-xl px-4 py-3 gap-4">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-medium text-minto-text truncate">{name}</span>
          <span className="text-[10px] bg-red-100 text-red-700 px-1.5 py-0.5 rounded-full font-semibold">{lossType}</span>
        </div>
        <div className="flex gap-3 mt-1 flex-wrap">
          {days != null && (
            <span className="text-xs text-minto-text-muted">{days} days held</span>
          )}
          {exitLoad > 0 ? (
            <span className="text-xs text-amber-600">{exitLoad}% exit load</span>
          ) : (
            <span className="text-xs text-green-600">Nil exit load ✓</span>
          )}
        </div>
      </div>
      <div className="text-right shrink-0">
        <div className="text-sm font-semibold text-red-600">{formatINR(-loss)}</div>
        {taxSaved > 0 && (
          <div className="text-xs text-green-700">saves {formatINR(taxSaved)}</div>
        )}
      </div>
    </div>
  );
}

function GainsCandidateRow({ candidate, target }: { candidate: GainsCandidate; target: number }) {
  const name = candidate.fund_name || "Unknown Fund";
  const ltcg = candidate.unrealised_ltcg || 0;
  const harvestable = Math.min(ltcg, candidate.harvestable_up_to ?? ltcg, target);
  const days = candidate.holding_days;
  const exitLoad = candidate.exit_load_pct || 0;

  return (
    <div className="flex items-start justify-between bg-white/50 rounded-xl px-4 py-3 gap-4">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-medium text-minto-text truncate">{name}</span>
          <span className="text-[10px] bg-green-100 text-green-700 px-1.5 py-0.5 rounded-full font-semibold">LTCG</span>
        </div>
        <div className="flex gap-3 mt-1 flex-wrap">
          {days != null && (
            <span className="text-xs text-minto-text-muted">{days} days held</span>
          )}
          {exitLoad > 0 ? (
            <span className="text-xs text-amber-600">{exitLoad}% exit load</span>
          ) : (
            <span className="text-xs text-green-600">Nil exit load ✓</span>
          )}
        </div>
      </div>
      <div className="text-right shrink-0">
        <div className="text-sm font-semibold text-green-700">{formatINR(ltcg)}</div>
        {harvestable < ltcg && (
          <div className="text-xs text-minto-text-muted">harvest up to {formatINR(harvestable)}</div>
        )}
      </div>
    </div>
  );
}
