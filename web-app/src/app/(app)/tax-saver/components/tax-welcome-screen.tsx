"use client";

import Image from "next/image";
import { FileText, BarChart2, TrendingDown, Calculator } from "lucide-react";

interface Props {
  onSend: (message: string) => void;
}

const WHAT_I_NEED = [
  { icon: FileText, label: "MFCentral CAS PDF" },
  { icon: BarChart2, label: "Broker Tax P&L" },
  { icon: TrendingDown, label: "Broker Holdings" },
];

export function TaxWelcomeScreen({ onSend }: Props) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center px-6 py-8 max-w-2xl mx-auto text-center">
      <div className="glass-card p-3 mb-5">
        <Image src="/minto.png" alt="Minto" width={52} height={52} />
      </div>

      <div className="flex items-center gap-2 mb-3">
        <Calculator size={18} className="text-minto-accent" />
        <span className="text-xs font-semibold text-minto-accent uppercase tracking-widest">
          Tax Harvesting 2025-26
        </span>
      </div>

      <h1 className="text-3xl md:text-4xl font-bold text-minto-text mb-3 tracking-tight">
        Save tax before March 31st
      </h1>
      <p className="text-minto-text-secondary text-base mb-6 max-w-md leading-relaxed">
        I&apos;ll analyse your mutual funds and stocks, build your complete capital gains picture,
        and tell you exactly how to harvest losses and use your ₹1.25L exemption.
      </p>

      {/* What I need chips */}
      <div className="flex flex-wrap justify-center gap-2 mb-8">
        {WHAT_I_NEED.map(({ icon: Icon, label }) => (
          <div
            key={label}
            className="glass-card flex items-center gap-2 px-4 py-2 text-sm text-minto-text-secondary"
          >
            <Icon size={14} className="text-minto-accent" />
            {label}
          </div>
        ))}
      </div>

      <p className="text-minto-text-muted text-sm mb-5">Takes about 5 minutes.</p>

      {/* CTA buttons */}
      <div className="flex flex-wrap justify-center gap-3">
        <button
          onClick={() => onSend("Let's go")}
          className="bg-minto-accent text-white px-8 py-3 rounded-full font-semibold hover:opacity-90 transition-opacity text-sm"
        >
          Let&apos;s go →
        </button>
        <button
          onClick={() => onSend("How does this work?")}
          className="glass-card px-8 py-3 rounded-full text-minto-text-secondary hover:text-minto-text hover:bg-white/70 transition-all text-sm font-medium"
        >
          How does this work?
        </button>
      </div>
    </div>
  );
}
