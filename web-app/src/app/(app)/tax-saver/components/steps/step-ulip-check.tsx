"use client";

import { useState } from "react";
import { ArrowRight } from "lucide-react";

interface Props {
  saving: boolean;
  onContinue: (hasDisclaimer: boolean) => void;
  onBlock: (name?: string, email?: string) => void;
}

type SubStep = "premium_check" | "gains_check" | "notify";

export function StepUlipCheck({ saving, onContinue, onBlock }: Props) {
  const [subStep, setSubStep] = useState<SubStep>("premium_check");
  const [premium, setPremium] = useState<"yes" | "no" | "not_sure" | null>(null);
  const [hasGains, setHasGains] = useState<"yes" | "no" | null>(null);
  const [proceedWithDisclaimer, setProceedWithDisclaimer] = useState<boolean | null>(null);
  const [notifyName, setNotifyName] = useState("");
  const [notifyEmail, setNotifyEmail] = useState("");

  if (subStep === "notify") {
    return (
      <div className="flex-1 flex flex-col items-center justify-center px-6 py-12 max-w-xl mx-auto">
        <div className="glass-card rounded-3xl p-8 w-full">
          <h2 className="text-xl font-bold text-minto-text mb-3">ULIP Support Coming Soon</h2>
          <p className="text-minto-text-secondary text-sm leading-relaxed mb-6">
            Since you&apos;ve realised gains from a high-premium equity ULIP this year, part of your
            ₹1.25L LTCG exemption may already be consumed in ways we can&apos;t calculate here.
            Any gains harvesting plan we generate could cause you to inadvertently exceed your exemption limit.
          </p>
          <div className="space-y-3 mb-5">
            <input
              type="text"
              placeholder="Your name"
              value={notifyName}
              onChange={(e) => setNotifyName(e.target.value)}
              className="w-full bg-white/10 border border-white/20 rounded-2xl px-4 py-3 text-minto-text text-sm focus:outline-none focus:border-minto-accent/60"
            />
            <input
              type="email"
              placeholder="Email address"
              value={notifyEmail}
              onChange={(e) => setNotifyEmail(e.target.value)}
              className="w-full bg-white/10 border border-white/20 rounded-2xl px-4 py-3 text-minto-text text-sm focus:outline-none focus:border-minto-accent/60"
            />
          </div>
          <div className="flex gap-3">
            <button
              onClick={() => onBlock(notifyName, notifyEmail)}
              className="flex-1 bg-minto-accent text-white py-3 rounded-full font-semibold hover:opacity-90 text-sm"
            >
              {notifyName && notifyEmail ? "Notify me" : "Got it"}
            </button>
            <button
              onClick={() => {
                setProceedWithDisclaimer(true);
                onContinue(true);
              }}
              className="flex-1 glass-card py-3 rounded-full text-minto-text-secondary text-sm hover:bg-white/60 transition-colors"
            >
              Proceed anyway
            </button>
          </div>
          {proceedWithDisclaimer && (
            <p className="text-xs text-minto-text-muted mt-3 text-center">
              A disclaimer will be shown on every analysis screen.
            </p>
          )}
        </div>
      </div>
    );
  }

  if (subStep === "gains_check") {
    return (
      <div className="flex-1 flex flex-col items-center justify-center px-6 py-12 max-w-xl mx-auto">
        <h2 className="text-2xl font-bold text-minto-text mb-3 text-center">
          Have you surrendered or partially withdrawn from this ULIP this year and made a profit?
        </h2>
        <p className="text-minto-text-secondary text-sm mb-8 text-center">
          Equity ULIPs with annual premium above ₹2.5L are taxed like equity mutual funds under Section 112A.
          They share the same ₹1.25L LTCG exemption.
        </p>
        <div className="w-full space-y-3 mb-8">
          {[
            { value: "yes" as const, label: "Yes, I have realised gains from this ULIP" },
            { value: "no" as const, label: "No, I haven't withdrawn or surrendered" },
          ].map(({ value, label }) => (
            <button
              key={value}
              onClick={() => setHasGains(value)}
              className={`w-full text-left px-5 py-4 rounded-2xl border transition-all ${
                hasGains === value
                  ? "border-minto-accent bg-minto-accent/10 text-minto-text"
                  : "border-white/20 bg-white/5 text-minto-text-secondary hover:bg-white/10"
              }`}
            >
              <span className="text-sm font-medium">{label}</span>
            </button>
          ))}
        </div>
        <button
          onClick={() => {
            if (hasGains === "yes") {
              setSubStep("notify");
            } else {
              onContinue(false);
            }
          }}
          disabled={!hasGains || saving}
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

  // premium_check (default)
  return (
    <div className="flex-1 flex flex-col items-center justify-center px-6 py-12 max-w-xl mx-auto">
      <h2 className="text-2xl font-bold text-minto-text mb-3 text-center">
        Does any single ULIP policy you hold have an annual premium above ₹2.5 lakh?
      </h2>
      <p className="text-minto-text-secondary text-sm mb-2 text-center">
        This is per policy, not total across all policies.
      </p>
      <div className="glass-subtle rounded-2xl px-4 py-3 mb-8 text-xs text-minto-text-secondary w-full max-w-md">
        <strong className="text-minto-text">Realised vs unrealised:</strong> Realised gains are profits from policies
        you&apos;ve actually surrendered or withdrawn from this year. Unrealised gains on active policies
        are not taxable yet.
      </div>

      <div className="w-full space-y-3 mb-8 max-w-md">
        {[
          { value: "yes" as const, label: "Yes, above ₹2.5 lakh" },
          { value: "no" as const, label: "No, all policies are ₹2.5 lakh or below" },
          { value: "not_sure" as const, label: "Not sure" },
        ].map(({ value, label }) => (
          <button
            key={value}
            onClick={() => setPremium(value)}
            className={`w-full text-left px-5 py-4 rounded-2xl border transition-all ${
              premium === value
                ? "border-minto-accent bg-minto-accent/10 text-minto-text"
                : "border-white/20 bg-white/5 text-minto-text-secondary hover:bg-white/10"
            }`}
          >
            <span className="text-sm font-medium">{label}</span>
          </button>
        ))}
      </div>

      <button
        onClick={() => {
          if (premium === "no") {
            onContinue(false);
          } else {
            setSubStep("gains_check");
          }
        }}
        disabled={!premium || saving}
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
