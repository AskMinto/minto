"use client";

import { useState } from "react";
import { ArrowRight } from "lucide-react";
import { WizardStep } from "@/hooks/use-tax-wizard";

interface Props {
  step: WizardStep;
  saving: boolean;
  onContinue: (regime: string, slabRate: number, baseIncome?: number) => void;
  onNeedIncomeBracket: () => void;
}

const NEW_REGIME_BRACKETS = [
  { label: "Up to ₹12 lakh (0% — Section 87A rebate applies, but see note)", slab: 0.0, income: 1_200_000 },
  { label: "₹12L – ₹16 lakh (15%)", slab: 0.15, income: 1_400_000 },
  { label: "₹16L – ₹20 lakh (20%)", slab: 0.20, income: 1_800_000 },
  { label: "₹20L – ₹24 lakh (25%)", slab: 0.25, income: 2_200_000 },
  { label: "Above ₹24 lakh (30%)", slab: 0.30, income: 3_000_000 },
  { label: "Not sure — assume 30%", slab: 0.30, income: 3_000_000 },
];

const OLD_REGIME_BRACKETS = [
  { label: "Up to ₹5 lakh (0–5%)", slab: 0.05, income: 400_000 },
  { label: "₹5L – ₹10 lakh (20%)", slab: 0.20, income: 750_000 },
  { label: "Above ₹10 lakh (30%)", slab: 0.30, income: 1_500_000 },
  { label: "Not sure — assume 30%", slab: 0.30, income: 1_500_000 },
];

export function StepTaxRegime({ step, saving, onContinue, onNeedIncomeBracket }: Props) {
  const [regime, setRegime] = useState<"new" | "old" | "not_sure" | null>(null);
  const [bracket, setBracket] = useState<{ slab: number; income: number } | null>(null);

  const isIncomeBracket = step === "income_bracket";

  if (isIncomeBracket) {
    const brackets = regime === "old" ? OLD_REGIME_BRACKETS : NEW_REGIME_BRACKETS;

    return (
      <div className="flex-1 flex flex-col items-center justify-center px-6 py-12 max-w-xl mx-auto">
        <h2 className="text-2xl font-bold text-minto-text mb-3 text-center">
          What&apos;s your approximate total income this year?
        </h2>
        <p className="text-minto-text-secondary text-sm mb-8 text-center">
          From salary and other non-investment sources. Capital gains are taxed at their own rates —
          we need your base income to determine the slab rate for any non-equity gains.
        </p>

        <div className="w-full space-y-2 mb-8">
          {brackets.map(({ label, slab, income }) => (
            <button
              key={label}
              onClick={() => setBracket({ slab, income })}
              className={`w-full text-left px-5 py-4 rounded-2xl border transition-all ${
                bracket?.slab === slab && bracket?.income === income
                  ? "border-minto-accent bg-minto-accent/10 text-minto-text"
                  : "border-white/20 bg-white/5 text-minto-text-secondary hover:bg-white/10"
              }`}
            >
              <span className="text-sm font-medium">{label}</span>
            </button>
          ))}
        </div>

        {bracket?.slab === 0 && regime !== "old" && (
          <div className="glass-subtle rounded-2xl px-4 py-3 mb-6 text-xs text-minto-text-secondary w-full">
            <strong className="text-minto-text">87A rebate note:</strong> The rebate reduces slab-rate tax to ₹0 if total income ≤ ₹12L.
            However, equity STCG (20%) and LTCG (12.5%) are NOT covered by the rebate.
            Also: if capital gains push your TOTAL income above ₹12L, the rebate is lost entirely.
            We&apos;ll re-check this after analysing your portfolio.
          </div>
        )}

        <button
          onClick={() => bracket && onContinue(regime!, bracket.slab, bracket.income)}
          disabled={!bracket || saving}
          className="bg-minto-accent text-white px-10 py-3.5 rounded-full font-semibold hover:opacity-90 transition-opacity text-sm disabled:opacity-40 flex items-center gap-2"
        >
          {saving ? (
            <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
          ) : (
            <>Continue <ArrowRight size={16} /></>
          )}
        </button>
      </div>
    );
  }

  // Regime selection (default)
  return (
    <div className="flex-1 flex flex-col items-center justify-center px-6 py-12 max-w-xl mx-auto">
      <h2 className="text-2xl font-bold text-minto-text mb-3 text-center">
        One last question before we collect your documents
      </h2>
      <p className="text-minto-text-secondary text-sm mb-8 text-center">
        For non-equity investments (like debt or hybrid funds), gains are taxed at your income tax slab rate.
        Which regime are you on this year?
      </p>

      <div className="w-full space-y-3 mb-8">
        {[
          { value: "new" as const, label: "New tax regime (default for FY 2025-26)" },
          { value: "old" as const, label: "Old tax regime" },
          { value: "not_sure" as const, label: "Not sure — use new regime rates" },
        ].map(({ value, label }) => (
          <button
            key={value}
            onClick={() => setRegime(value)}
            className={`w-full text-left px-5 py-4 rounded-2xl border transition-all ${
              regime === value
                ? "border-minto-accent bg-minto-accent/10 text-minto-text"
                : "border-white/20 bg-white/5 text-minto-text-secondary hover:bg-white/10"
            }`}
          >
            <span className="text-sm font-medium">{label}</span>
          </button>
        ))}
      </div>

      <button
        onClick={() => regime && onNeedIncomeBracket()}
        disabled={!regime || saving}
        className="bg-minto-accent text-white px-10 py-3.5 rounded-full font-semibold hover:opacity-90 transition-opacity text-sm disabled:opacity-40 flex items-center gap-2"
      >
        {saving ? (
          <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
        ) : (
          <>Continue <ArrowRight size={16} /></>
        )}
      </button>
    </div>
  );
}
