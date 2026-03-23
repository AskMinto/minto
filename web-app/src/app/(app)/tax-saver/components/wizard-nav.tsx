"use client";

import { ArrowLeft } from "lucide-react";
import { WizardStep } from "@/hooks/use-tax-wizard";

interface Props {
  step: WizardStep;
  onBack: () => void;
  saving: boolean;
}

const STEP_LABELS: Partial<Record<WizardStep, string>> = {
  residency_check: "Eligibility",
  portfolio_type: "Your Portfolio",
  nps_tier: "NPS Details",
  ulip_check: "ULIP Details",
  cf_check: "Carry-Forward Losses",
  cf_how_to_check: "How to Check",
  tax_regime: "Tax Regime",
  income_bracket: "Income Bracket",
  documents: "Documents",
};

const STEP_ORDER: WizardStep[] = [
  "residency_check",
  "portfolio_type",
  "cf_check",
  "tax_regime",
  "documents",
  "analysis",
];

export function WizardNav({ step, onBack, saving }: Props) {
  const label = STEP_LABELS[step] || "";
  const stepIndex = STEP_ORDER.indexOf(step);
  const pct = stepIndex >= 0 ? ((stepIndex + 1) / STEP_ORDER.length) * 100 : 0;

  return (
    <div className="px-4 py-3 border-b border-white/20">
      <div className="max-w-2xl mx-auto">
        <div className="flex items-center gap-3 mb-2">
          <button
            onClick={onBack}
            disabled={saving}
            className="w-8 h-8 rounded-full hover:bg-black/10 flex items-center justify-center transition-colors disabled:opacity-40 shrink-0"
          >
            <ArrowLeft size={16} className="text-minto-text-secondary" />
          </button>
          <div className="flex-1">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-medium text-minto-text-secondary">{label}</span>
              <span className="text-xs text-minto-text-muted">
                {stepIndex >= 0 ? `${stepIndex + 1} of ${STEP_ORDER.length}` : ""}
              </span>
            </div>
            <div className="h-1 bg-white/20 rounded-full overflow-hidden">
              <div
                className="h-full bg-minto-accent transition-all duration-500"
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
