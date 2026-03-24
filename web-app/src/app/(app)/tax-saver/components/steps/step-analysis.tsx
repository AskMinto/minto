"use client";

import { useState } from "react";
import { CheckCircle, TrendingDown, TrendingUp, AlertCircle, RefreshCw, RotateCcw } from "lucide-react";
import { WizardSessionState, LossCandidate, GainsCandidate } from "@/hooks/use-tax-wizard";

interface Props {
  sessionState: WizardSessionState;
  onSyncHoldings: (brokerName?: string) => Promise<{ upserted: number; message: string }>;
  onUploadMore: () => void;
  onStartOver: () => Promise<void>;
}

function fmt(n: number | null | undefined): string {
  if (n == null) return "—";
  return `₹${Math.abs(n).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
}

function pct(n: number | null | undefined): string {
  if (n == null) return "—";
  return `${(n * 100).toFixed(0)}%`;
}

export function StepAnalysis({ sessionState, onSyncHoldings, onUploadMore, onStartOver }: Props) {
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<string | null>(null);
  const [startingOver, setStartingOver] = useState(false);

  const analysis = sessionState.tax_analysis;
  const lossMf = sessionState.loss_harvest_mf || [];
  const lossStocks = sessionState.loss_harvest_stocks || [];
  const gainsMf = sessionState.gains_harvest_mf || [];

  const activeLossMf = lossMf.filter((c) => !c.excluded);
  const activeLossStocks = lossStocks.filter((c) => !c.excluded);
  const activeGainsMf = gainsMf;

  const hasBrokerHoldings = sessionState.has_broker_holdings;

  const handleSync = async () => {
    setSyncing(true);
    try {
      const res = await onSyncHoldings();
      setSyncResult(res.message);
    } finally {
      setSyncing(false);
    }
  };

  if (!analysis) {
    return (
      <div className="flex-1 flex items-center justify-center px-6 py-12">
        <div className="text-center">
          <AlertCircle size={40} className="text-minto-text-muted mx-auto mb-4" />
          <p className="text-minto-text-secondary">No analysis yet.</p>
          <button
            onClick={onUploadMore}
            className="mt-4 text-minto-accent text-sm hover:underline"
          >
            Go back and upload documents
          </button>
        </div>
      </div>
    );
  }

  const totalTax = analysis.total_tax ?? 0;
  const exemptionRemaining = analysis.exemption_remaining ?? 0;
  const exemptionUsed = analysis.exemption_used ?? 0;

  return (
    <div className="flex-1 flex flex-col px-6 py-8 max-w-2xl mx-auto w-full space-y-5">
      {/* ULIP disclaimer */}
      {sessionState.ulip_disclaimer_active && (
        <div className="bg-yellow-400/10 border border-yellow-400/30 rounded-2xl px-4 py-3 text-xs text-yellow-600">
          <strong>ULIP disclaimer:</strong> This analysis does not account for LTCG exemption already consumed
          by your high-premium equity ULIP gains. You may end up over-harvesting. Consult a CA.
        </div>
      )}

      {/* Tax Liability Card */}
      <div className="glass-card rounded-3xl p-6">
        <p className="text-xs font-semibold text-minto-text-muted uppercase tracking-widest mb-4">
          FY 2025-26 Tax Summary
        </p>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="text-xs text-minto-text-muted mb-1">Total tax liability</p>
            <p className={`text-2xl font-bold ${totalTax === 0 ? "text-minto-positive" : "text-minto-negative"}`}>
              {totalTax === 0 ? "₹0 ✓" : fmt(totalTax)}
            </p>
          </div>
          <div>
            <p className="text-xs text-minto-text-muted mb-1">₹1.25L exemption used</p>
            <p className="text-2xl font-bold text-minto-text">{fmt(exemptionUsed)}</p>
          </div>
          <div>
            <p className="text-xs text-minto-text-muted mb-1">Exemption remaining</p>
            <p className={`text-xl font-bold ${exemptionRemaining > 0 ? "text-minto-accent" : "text-minto-text-muted"}`}>
              {fmt(exemptionRemaining)}
            </p>
          </div>
          <div>
            <p className="text-xs text-minto-text-muted mb-1">Tax regime / slab</p>
            <p className="text-sm font-medium text-minto-text">
              {analysis.tax_regime === "new" ? "New regime" : "Old regime"} · {pct(analysis.slab_rate)}
            </p>
          </div>
        </div>

        {analysis.optimal_vs_naive_saving && analysis.optimal_vs_naive_saving > 0 && (
          <div className="mt-4 glass-subtle rounded-xl px-3 py-2 text-xs text-minto-text-secondary">
            Smart CF allocation saved you an extra <strong className="text-minto-positive">{fmt(analysis.optimal_vs_naive_saving)}</strong> vs naive ordering.
          </div>
        )}
      </div>

      {/* Loss Harvesting */}
      {(activeLossMf.length > 0 || activeLossStocks.length > 0) && (
        <div className="glass-card rounded-3xl p-6">
          <div className="flex items-center gap-2 mb-4">
            <TrendingDown size={16} className="text-minto-accent" />
            <p className="text-sm font-bold text-minto-text">Loss Harvesting Opportunities</p>
          </div>

          {activeLossMf.length > 0 && (
            <div className="mb-4">
              <p className="text-xs text-minto-text-muted uppercase tracking-wide mb-2">Mutual Funds</p>
              <div className="space-y-2">
                {activeLossMf.map((c, i) => (
                  <LossRow key={i} candidate={c} />
                ))}
              </div>
            </div>
          )}

          {activeLossStocks.length > 0 && (
            <div>
              <p className="text-xs text-minto-text-muted uppercase tracking-wide mb-2">Stocks & ETFs</p>
              <div className="space-y-2">
                {activeLossStocks.map((c, i) => (
                  <LossRow key={i} candidate={c} />
                ))}
              </div>
            </div>
          )}

          {totalTax === 0 && (
            <div className="mt-4 glass-subtle rounded-xl px-3 py-2 text-xs text-minto-text-secondary">
              <strong>Carry-forward mode:</strong> Your tax liability is ₹0. Booking these losses builds a
              carry-forward bank for FY 2026-27. <strong>File ITR-2 or ITR-3 (not ITR-1) before July 31, 2026</strong> to carry them forward.
            </div>
          )}
        </div>
      )}

      {/* Gains Harvesting */}
      {exemptionRemaining > 0 && activeGainsMf.length > 0 && (
        <div className="glass-card rounded-3xl p-6">
          <div className="flex items-center gap-2 mb-4">
            <TrendingUp size={16} className="text-minto-positive" />
            <p className="text-sm font-bold text-minto-text">Gains Harvesting</p>
          </div>
          <p className="text-xs text-minto-text-secondary mb-3">
            You have <strong className="text-minto-accent">{fmt(exemptionRemaining)}</strong> of LTCG exemption remaining.
            Book gains up to this limit before March 31st and reinvest on April 1st.
          </p>
          <div className="space-y-2">
            {activeGainsMf.map((c, i) => (
              <GainsRow key={i} candidate={c} />
            ))}
          </div>
          <div className="mt-4 glass-subtle rounded-xl px-3 py-2 text-xs text-minto-text-secondary">
            <strong>Reinvest on April 1, 2026</strong> (first business day of FY 2026-27) — not before.
            New units start the new FY with a higher cost basis. No wash sale rule in India.
          </div>
        </div>
      )}

      {/* ITR filing reminder */}
      {(activeLossMf.length > 0 || activeLossStocks.length > 0) && (
        <div className="glass-subtle rounded-2xl px-4 py-3 text-xs text-minto-text-secondary">
          <strong className="text-minto-text">ITR filing reminder:</strong> File <strong>ITR-2 or ITR-3</strong> (not ITR-1)
          before <strong>July 31, 2026</strong> to carry forward these losses.
          Filing ITR-1 or filing late means the losses are permanently lost.
        </div>
      )}

      {/* Sync holdings */}
      {hasBrokerHoldings && !syncResult && (
        <div className="glass-card rounded-3xl p-5 flex items-center justify-between gap-4">
          <div>
            <p className="text-sm font-medium text-minto-text">Sync holdings to Minto?</p>
            <p className="text-xs text-minto-text-muted mt-0.5">
              Add your broker holdings to your Minto portfolio for ongoing tracking.
            </p>
          </div>
          <button
            onClick={handleSync}
            disabled={syncing}
            className="flex items-center gap-1.5 bg-minto-accent/15 text-minto-accent px-4 py-2 rounded-full text-xs font-semibold hover:bg-minto-accent/25 transition-colors shrink-0 disabled:opacity-50"
          >
            {syncing ? <RefreshCw size={12} className="animate-spin" /> : <CheckCircle size={12} />}
            {syncing ? "Syncing…" : "Sync"}
          </button>
        </div>
      )}

      {syncResult && (
        <div className="glass-subtle rounded-2xl px-4 py-3 text-xs text-minto-positive">
          <CheckCircle size={12} className="inline mr-1.5" />
          {syncResult}
        </div>
      )}

      {/* All good note */}
      {activeLossMf.length === 0 && activeLossStocks.length === 0 && exemptionRemaining <= 0 && (
        <div className="glass-subtle rounded-2xl px-4 py-5 text-center text-minto-text-secondary text-sm">
          <CheckCircle size={20} className="text-minto-positive mx-auto mb-2" />
          All exemptions used and no harvestable losses found. You&apos;re fully optimised!
        </div>
      )}

      {/* Disclaimer */}
      <p className="text-xs text-minto-text-muted text-center">
        Surcharge and 4% cess not included. This is informational only — consult a CA for your final tax liability.
        Dividend income is taxed separately as Income from Other Sources.
      </p>

      {/* Start over */}
      <div className="flex justify-center pb-6">
        <button
          onClick={async () => {
            setStartingOver(true);
            await onStartOver();
          }}
          disabled={startingOver}
          className="flex items-center gap-2 text-minto-text-muted hover:text-minto-text text-xs py-2 px-4 rounded-full hover:bg-black/5 transition-colors disabled:opacity-40"
        >
          <RotateCcw size={12} className={startingOver ? "animate-spin" : ""} />
          {startingOver ? "Resetting…" : "Start over with new documents"}
        </button>
      </div>
    </div>
  );
}

function LossRow({ candidate }: { candidate: LossCandidate }) {
  const name = candidate.fund_name || candidate.scrip_name || "Unknown";
  return (
    <div className="flex items-center justify-between py-2 border-b border-white/10 last:border-0">
      <div className="min-w-0 mr-3">
        <p className="text-xs font-medium text-minto-text truncate">{name}</p>
        <p className="text-xs text-minto-text-muted">{candidate.loss_type} · {candidate.holding_days ? `${candidate.holding_days}d` : ""}</p>
      </div>
      <div className="text-right shrink-0">
        <p className="text-xs font-semibold text-minto-negative">-{`₹${Math.abs(candidate.unrealised_gain).toLocaleString("en-IN", { maximumFractionDigits: 0 })}`}</p>
        {candidate.tax_saved > 0 && (
          <p className="text-xs text-minto-positive">saves ₹{candidate.tax_saved.toLocaleString("en-IN", { maximumFractionDigits: 0 })}</p>
        )}
      </div>
    </div>
  );
}

function GainsRow({ candidate }: { candidate: GainsCandidate }) {
  return (
    <div className="flex items-center justify-between py-2 border-b border-white/10 last:border-0">
      <div className="min-w-0 mr-3">
        <p className="text-xs font-medium text-minto-text truncate">{candidate.fund_name}</p>
        <p className="text-xs text-minto-text-muted">
          {candidate.is_elss ? "ELSS (unlocked)" : "Equity MF"} · {candidate.holding_days}d
          {candidate.exit_load_pct > 0 ? ` · ${candidate.exit_load_pct}% exit load` : " · Nil exit load"}
        </p>
      </div>
      <div className="text-right shrink-0">
        <p className="text-xs font-semibold text-minto-positive">
          +₹{candidate.net_ltcg_after_exit_load.toLocaleString("en-IN", { maximumFractionDigits: 0 })}
        </p>
        <p className="text-xs text-minto-text-muted">
          harvest ₹{candidate.harvestable_up_to.toLocaleString("en-IN", { maximumFractionDigits: 0 })}
        </p>
      </div>
    </div>
  );
}
