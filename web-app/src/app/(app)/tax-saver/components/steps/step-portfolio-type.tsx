"use client";

import { useState } from "react";
import { ArrowRight } from "lucide-react";

interface Props {
  saving: boolean;
  onContinue: (
    selected: string[],
    extras: { blocked: boolean; blockReason?: string; hasNps: boolean; hasUlip: boolean }
  ) => void;
}

const OPTIONS = [
  { id: "1", label: "Mutual Funds" },
  { id: "2", label: "Stocks & ETFs (in a demat account)" },
  { id: "3", label: "NPS (National Pension System)" },
  { id: "4", label: "ULIPs (Unit Linked Insurance Plans)" },
  { id: "5", label: "Unlisted shares" },
  { id: "6", label: "Foreign stocks or equity investments (e.g. US stocks via Vested, INDmoney)" },
];

export function StepPortfolioType({ saving, onContinue }: Props) {
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleContinue = () => {
    const arr = Array.from(selected);

    // Foreign equity → hard block
    if (selected.has("6")) {
      onContinue(arr, { blocked: true, blockReason: "foreign", hasNps: false, hasUlip: false });
      return;
    }

    onContinue(arr, {
      blocked: false,
      hasNps: selected.has("3"),
      hasUlip: selected.has("4"),
    });
  };

  return (
    <div className="flex-1 flex flex-col items-center justify-center px-6 py-12 max-w-xl mx-auto">
      <h2 className="text-2xl font-bold text-minto-text mb-2 text-center">
        What do you hold?
      </h2>
      <p className="text-minto-text-secondary text-sm mb-8 text-center">
        Select all that apply — we&apos;ll only ask for relevant documents.
      </p>

      <div className="w-full space-y-2 mb-8">
        {OPTIONS.map(({ id, label }) => (
          <button
            key={id}
            onClick={() => toggle(id)}
            className={`w-full text-left px-5 py-4 rounded-2xl border transition-all flex items-center gap-3 ${
              selected.has(id)
                ? "border-minto-accent bg-minto-accent/10 text-minto-text"
                : "border-white/20 bg-white/5 text-minto-text-secondary hover:bg-white/10"
            }`}
          >
            <div
              className={`w-5 h-5 rounded-md border-2 shrink-0 flex items-center justify-center transition-colors ${
                selected.has(id) ? "border-minto-accent bg-minto-accent" : "border-white/40"
              }`}
            >
              {selected.has(id) && (
                <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
                  <path d="M1 4L3.5 6.5L9 1" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              )}
            </div>
            <span className="text-sm font-medium">{label}</span>
          </button>
        ))}
      </div>

      {selected.has("5") && !selected.has("6") && (
        <div className="glass-subtle rounded-2xl px-4 py-3 mb-6 text-xs text-minto-text-secondary w-full">
          <strong className="text-minto-text">Note on unlisted shares:</strong> Taxed under Section 112, not Section 112A.
          They do NOT share the ₹1.25L exemption. We&apos;ll proceed with your mutual funds and stocks analysis.
        </div>
      )}

      <button
        onClick={handleContinue}
        disabled={selected.size === 0 || saving}
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
