"use client";

import { useState } from "react";
import { ArrowRight } from "lucide-react";

interface Props {
  saving: boolean;
  onContinue: (tier: string) => void;
}

const TIERS = [
  {
    id: "tier1",
    label: "Tier I only",
    note: "NPS Tier I withdrawals and gains are not taxed as capital gains under Sections 10(12A) and 10(12B). Your NPS Tier I does not affect your ₹1.25L LTCG exemption or harvesting plan in any way.",
  },
  {
    id: "tier2",
    label: "Tier II only",
    note: "NPS Tier II tax treatment is debated — some treat it as capital gains, others as income from other sources. This tool does not factor in Tier II gains. Consult a CA for significant Tier II transactions.",
  },
  {
    id: "both",
    label: "Both Tier I and Tier II",
    note: "Tier I is clearly not taxed as capital gains. Tier II treatment is debated — this tool does not factor in Tier II gains. We'll proceed with your mutual funds and stocks analysis.",
  },
];

export function StepNpsTier({ saving, onContinue }: Props) {
  const [selected, setSelected] = useState<string | null>(null);

  return (
    <div className="flex-1 flex flex-col items-center justify-center px-6 py-12 max-w-xl mx-auto">
      <h2 className="text-2xl font-bold text-minto-text mb-2 text-center">
        Which NPS tier do you hold?
      </h2>
      <p className="text-minto-text-secondary text-sm mb-8 text-center">
        NPS has different tax treatment depending on the tier.
      </p>

      <div className="w-full space-y-3 mb-6">
        {TIERS.map(({ id, label, note }) => (
          <button
            key={id}
            onClick={() => setSelected(id)}
            className={`w-full text-left px-5 py-4 rounded-2xl border transition-all ${
              selected === id
                ? "border-minto-accent bg-minto-accent/10 text-minto-text"
                : "border-white/20 bg-white/5 text-minto-text-secondary hover:bg-white/10"
            }`}
          >
            <p className="text-sm font-medium">{label}</p>
          </button>
        ))}
      </div>

      {selected && (
        <div className="glass-subtle rounded-2xl px-4 py-3 mb-6 text-xs text-minto-text-secondary w-full">
          {TIERS.find((t) => t.id === selected)?.note}
        </div>
      )}

      <button
        onClick={() => selected && onContinue(selected)}
        disabled={!selected || saving}
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
