"use client";

import { useState } from "react";
import { Globe, ArrowRight } from "lucide-react";

interface Props {
  onResident: () => void;
  onNRI: (name?: string, email?: string) => void;
}

export function StepResidency({ onResident, onNRI }: Props) {
  const [selected, setSelected] = useState<"resident" | "nri" | null>(null);
  const [showNotify, setShowNotify] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");

  const handleContinue = () => {
    if (selected === "resident") {
      onResident();
    } else if (selected === "nri") {
      setShowNotify(true);
    }
  };

  if (showNotify) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center px-6 py-12 max-w-xl mx-auto">
        <div className="glass-card rounded-3xl p-8 w-full">
          <h2 className="text-xl font-bold text-minto-text mb-3">NRI Support Coming Soon</h2>
          <p className="text-minto-text-secondary text-sm leading-relaxed mb-6">
            This tool is currently built for resident Indians only. NRIs have different tax rules —
            including TDS on redemptions, different rate structures, and potential DTAA benefits —
            that this tool doesn&apos;t handle yet.
          </p>
          <div className="space-y-3 mb-5">
            <input
              type="text"
              placeholder="Your name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full bg-white/10 border border-white/20 rounded-2xl px-4 py-3 text-minto-text text-sm focus:outline-none focus:border-minto-accent/60"
            />
            <input
              type="email"
              placeholder="Email address"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full bg-white/10 border border-white/20 rounded-2xl px-4 py-3 text-minto-text text-sm focus:outline-none focus:border-minto-accent/60"
            />
          </div>
          <button
            onClick={() => onNRI(name, email)}
            className="w-full bg-minto-accent text-white py-3 rounded-full font-semibold hover:opacity-90 transition-opacity text-sm"
          >
            {name && email ? "Notify me when ready" : "Got it"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col items-center justify-center px-6 py-12 max-w-xl mx-auto">
      <div className="w-12 h-12 rounded-full bg-minto-accent/15 flex items-center justify-center mb-5">
        <Globe size={22} className="text-minto-accent" />
      </div>

      <h2 className="text-2xl font-bold text-minto-text mb-2 text-center">
        Are you a resident Indian for tax purposes this financial year?
      </h2>
      <p className="text-minto-text-secondary text-sm mb-8 text-center">
        This tool is built for resident Indians only.
      </p>

      <div className="w-full space-y-3 mb-8">
        {[
          { value: "resident" as const, label: "Yes, I am a resident Indian" },
          { value: "nri" as const, label: "No, I am an NRI or live abroad" },
        ].map(({ value, label }) => (
          <button
            key={value}
            onClick={() => setSelected(value)}
            className={`w-full text-left px-5 py-4 rounded-2xl border transition-all ${
              selected === value
                ? "border-minto-accent bg-minto-accent/10 text-minto-text"
                : "border-white/20 bg-white/5 text-minto-text-secondary hover:bg-white/10"
            }`}
          >
            <span className="text-sm font-medium">{label}</span>
          </button>
        ))}
      </div>

      <button
        onClick={handleContinue}
        disabled={!selected}
        className="bg-minto-accent text-white px-10 py-3.5 rounded-full font-semibold hover:opacity-90 transition-opacity text-sm disabled:opacity-40 flex items-center gap-2"
      >
        Continue <ArrowRight size={16} />
      </button>
    </div>
  );
}
