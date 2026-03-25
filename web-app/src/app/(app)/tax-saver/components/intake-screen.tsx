"use client";

import React, { useState } from "react";
import Image from "next/image";
import {
  ArrowRight, Check, ClipboardList, FileText, BarChart3,
  Building2, TrendingUp, Wallet, MoreHorizontal,
} from "lucide-react";
import type { IntakeAnswers } from "@/hooks/use-tax-saver";

interface Props {
  onSubmit: (answers: IntakeAnswers) => Promise<void>;
}

const INCOME_SLABS = [
  { label: "< ₹5L", value: "<5L" },
  { label: "₹5–10L", value: "5-10L" },
  { label: "₹10–15L", value: "10-15L" },
  { label: "₹15–30L", value: "15-30L" },
  { label: "> ₹30L", value: ">30L" },
];

const TAX_REGIMES = [
  { label: "New Regime", value: "new", desc: "Default for FY 2025-26" },
  { label: "Old Regime", value: "old", desc: "With deductions (80C, HRA etc)" },
];

// Mutual funds sentinel — selecting this triggers CAS upload
const MF_OPTION = { label: "Mutual Funds (via CAMS / KFintech)", value: "Mutual Funds (via CAMS/KFintech)", icon: Building2 };

// Demat brokers — each triggers a Tax P&L + Holdings pair
const BROKER_OPTIONS = [
  { label: "Zerodha", value: "Zerodha", icon: TrendingUp },
  { label: "Groww", value: "Groww", icon: TrendingUp },
  { label: "Upstox", value: "Upstox", icon: TrendingUp },
  { label: "Angel One", value: "Angel One", icon: TrendingUp },
  { label: "ICICI Direct", value: "ICICI Direct", icon: Wallet },
  { label: "HDFC Securities", value: "HDFC Securities", icon: Wallet },
  { label: "Other broker", value: "Other", icon: MoreHorizontal },
];

export function IntakeScreen({ onSubmit }: Props) {
  const [incomeSlab, setIncomeSlab] = useState<string | null>(null);
  const [taxRegime, setTaxRegime] = useState<string | null>(null);
  const [selectedBrokers, setSelectedBrokers] = useState<string[]>([]);
  const [hasCarryForward, setHasCarryForward] = useState<boolean | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const toggleBroker = (value: string) => {
    setSelectedBrokers((prev) =>
      prev.includes(value) ? prev.filter((b) => b !== value) : [...prev, value]
    );
  };

  const canSubmit =
    incomeSlab !== null &&
    taxRegime !== null &&
    selectedBrokers.length > 0 &&
    hasCarryForward !== null;

  const handleSubmit = async () => {
    if (!canSubmit || submitting) return;
    setError("");
    setSubmitting(true);
    try {
      await onSubmit({
        income_slab: incomeSlab!,
        tax_regime: taxRegime!,
        brokers: selectedBrokers,
        has_carry_forward: hasCarryForward!,
        financial_year: "2025-26",
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-2xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex flex-col items-center text-center mb-10">
          <div className="w-14 h-14 rounded-full glass-card flex items-center justify-center mb-4">
            <Image src="/minto.png" alt="Minto" width={36} height={36} />
          </div>
          <h1 className="text-2xl font-semibold text-minto-text mb-2">
            Tax Harvesting Analyser
          </h1>
          <p className="text-minto-text/80 text-sm max-w-md leading-relaxed">
            Answer 4 quick questions and upload your documents. I&apos;ll calculate your FY 2025-26
            capital gains tax and generate a personalised harvest plan before March 31st.
          </p>
          <div className="flex items-center gap-5 mt-4">
            {[
              { label: "4 questions", Icon: ClipboardList },
              { label: "Upload docs", Icon: FileText },
              { label: "Get your plan", Icon: BarChart3 },
            ].map((s) => (
              <div key={s.label} className="flex items-center gap-1.5 text-xs text-minto-text/80">
                <s.Icon size={13} className="text-minto-accent/70" />
                <span>{s.label}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="space-y-8">
          {/* Q1: Income slab */}
          <QuestionBlock
            number={1}
            question="What's your approximate annual income?"
            answered={incomeSlab !== null}
          >
            <div className="flex flex-wrap gap-2">
              {INCOME_SLABS.map((opt) => (
                <ChipButton
                  key={opt.value}
                  label={opt.label}
                  selected={incomeSlab === opt.value}
                  onClick={() => setIncomeSlab(opt.value)}
                />
              ))}
            </div>
          </QuestionBlock>

          {/* Q2: Tax regime */}
          <QuestionBlock
            number={2}
            question="Which tax regime are you filing under this year?"
            answered={taxRegime !== null}
          >
            <div className="flex flex-col sm:flex-row gap-3">
              {TAX_REGIMES.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => setTaxRegime(opt.value)}
                  className={[
                    "flex-1 rounded-2xl border px-5 py-4 text-left transition-all",
                    taxRegime === opt.value
                      ? "border-minto-accent bg-minto-accent/8 shadow-sm"
                      : "border-white/30 bg-white/30 hover:bg-white/50",
                  ].join(" ")}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-medium text-minto-text text-sm">{opt.label}</span>
                    {taxRegime === opt.value && (
                      <div className="w-5 h-5 rounded-full bg-minto-accent flex items-center justify-center">
                        <Check size={12} className="text-white" />
                      </div>
                    )}
                  </div>
                  <span className="text-xs text-minto-text/80">{opt.desc}</span>
                </button>
              ))}
            </div>
          </QuestionBlock>

          {/* Q3: What do you hold */}
          <QuestionBlock
            number={3}
            question="What do you invest in? Select all that apply."
            answered={selectedBrokers.length > 0}
          >
            {/* MF option — triggers CAS upload */}
            <div className="mb-3">
              <p className="text-[11px] text-minto-text-muted mb-1.5 uppercase tracking-wide font-medium">Mutual Funds</p>
              <MultiChipButton
                icon={MF_OPTION.icon}
                label={MF_OPTION.label}
                selected={selectedBrokers.includes(MF_OPTION.value)}
                onClick={() => toggleBroker(MF_OPTION.value)}
              />
              {selectedBrokers.includes(MF_OPTION.value) && (
                <p className="text-[11px] text-minto-accent mt-1.5">→ You'll upload a CAS PDF from MFCentral</p>
              )}
            </div>
            {/* Broker options — each triggers Tax P&L + Holdings */}
            <div>
              <p className="text-[11px] text-minto-text-muted mb-1.5 uppercase tracking-wide font-medium">Stocks & ETFs (demat broker)</p>
              <div className="flex flex-wrap gap-2">
                {BROKER_OPTIONS.map((opt) => (
                  <MultiChipButton
                    key={opt.value}
                    icon={opt.icon}
                    label={opt.label}
                    selected={selectedBrokers.includes(opt.value)}
                    onClick={() => toggleBroker(opt.value)}
                  />
                ))}
              </div>
              {selectedBrokers.some((b) => BROKER_OPTIONS.some((o) => o.value === b)) && (
                <p className="text-[11px] text-minto-accent mt-1.5">→ You'll upload a Tax P&L and Holdings file per broker</p>
              )}
            </div>
          </QuestionBlock>

          {/* Q4: Carry-forward losses */}
          <QuestionBlock
            number={4}
            question="Do you have capital losses from a previous year carried forward?"
            answered={hasCarryForward !== null}
          >
            <p className="text-xs text-minto-text/80 mb-3">
              If you filed ITR-2/ITR-3 last year with capital losses, those can offset this year&apos;s gains.
            </p>
            <div className="flex gap-3">
              {[
                { label: "Yes, I do", value: true },
                { label: "No / Not sure", value: false },
              ].map((opt) => (
                <ChipButton
                  key={String(opt.value)}
                  label={opt.label}
                  selected={hasCarryForward === opt.value}
                  onClick={() => setHasCarryForward(opt.value)}
                />
              ))}
            </div>
            {hasCarryForward === true && (
              <p className="text-xs text-minto-accent mt-2">
                You&apos;ll need to upload last year&apos;s ITR PDF in the next step.
              </p>
            )}
          </QuestionBlock>

          {/* Error */}
          {error && (
            <p className="text-sm text-red-500 text-center">{error}</p>
          )}

          {/* Submit */}
          <button
            onClick={handleSubmit}
            disabled={!canSubmit || submitting}
            className="w-full bg-minto-accent text-white rounded-2xl px-6 py-4 text-sm font-medium flex items-center justify-center gap-2 disabled:opacity-40 hover:opacity-90 transition-opacity"
          >
            {submitting ? (
              <>
                <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                Getting your document list...
              </>
            ) : (
              <>
                Continue — see what documents I need
                <ArrowRight size={16} />
              </>
            )}
          </button>

          <p className="text-center text-[10px] text-minto-text/80">
            Raw documents are deleted from servers within 60 seconds of parsing (DPDPA compliant)
          </p>
        </div>
      </div>
    </div>
  );
}

function QuestionBlock({
  number,
  question,
  answered,
  children,
}: {
  number: number;
  question: string;
  answered: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="glass-card rounded-2xl p-5">
      <div className="flex items-start gap-3 mb-4">
        <div
          className={[
            "w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold shrink-0",
            answered
              ? "bg-minto-accent text-white"
              : "bg-white/50 text-minto-text/80 border border-white/40",
          ].join(" ")}
        >
          {answered ? <Check size={14} /> : number}
        </div>
        <p className="font-medium text-minto-text text-[15px] leading-snug pt-0.5">{question}</p>
      </div>
      {children}
    </div>
  );
}

function ChipButton({
  label,
  selected,
  onClick,
}: {
  label: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={[
        "px-4 py-2 rounded-full text-sm font-medium transition-all border",
        selected
          ? "bg-minto-accent text-white border-minto-accent shadow-sm"
          : "bg-white/40 text-minto-text border-white/30 hover:bg-white/60",
      ].join(" ")}
    >
      {label}
    </button>
  );
}

function MultiChipButton({
  icon: Icon,
  label,
  selected,
  onClick,
}: {
  icon: React.ElementType;
  label: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={[
        "flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium transition-all border",
        selected
          ? "bg-minto-accent/10 text-minto-accent border-minto-accent/40 shadow-sm"
          : "bg-white/40 text-minto-text border-white/30 hover:bg-white/60",
      ].join(" ")}
    >
      <Icon size={14} className={selected ? "text-minto-accent" : "text-minto-text/60"} />
      <span>{label}</span>
      {selected && <Check size={13} className="ml-0.5" />}
    </button>
  );
}
