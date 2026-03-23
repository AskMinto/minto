"use client";

import { useState } from "react";
import { ArrowRight, ExternalLink } from "lucide-react";
import { WizardStep } from "@/hooks/use-tax-wizard";

interface Props {
  step: WizardStep;
  saving: boolean;
  onYes: () => void;
  onNo: () => void;
  onNotSure: () => void;
}

export function StepCarryForward({ step, saving, onYes, onNo, onNotSure }: Props) {
  const [selected, setSelected] = useState<"yes" | "no" | "not_sure" | null>(null);

  const isHowToCheck = step === "cf_how_to_check";

  const handleContinue = () => {
    if (selected === "yes") onYes();
    else if (selected === "no") onNo();
    else if (selected === "not_sure") onNotSure();
  };

  if (isHowToCheck) {
    return (
      <div className="flex-1 flex flex-col items-center justify-start px-6 py-10 max-w-xl mx-auto">
        <h2 className="text-2xl font-bold text-minto-text mb-5 text-center">
          How to check for carry-forward losses
        </h2>

        <div className="glass-card rounded-3xl p-6 w-full mb-5 space-y-4 text-sm text-minto-text-secondary">
          <div>
            <p className="font-semibold text-minto-text mb-2">Option 1 — Check your last ITR online:</p>
            <ol className="space-y-1 list-decimal list-inside text-xs leading-relaxed">
              <li>Go to incometax.gov.in</li>
              <li>Login with PAN + password or Aadhaar OTP</li>
              <li>e-File → Income Tax Returns → View Filed Returns</li>
              <li>Click on AY 2025-26 (filed for FY 2024-25)</li>
              <li>Open the ITR → go to <strong>Schedule CFL</strong></li>
            </ol>
            <p className="text-xs mt-2">Look for &quot;Loss to be carried forward&quot; under Capital Gains. Any non-zero figure means you have CF losses.</p>
            <a
              href="https://eportal.incometax.gov.in"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs text-minto-accent mt-2 hover:underline"
            >
              Open IT portal <ExternalLink size={10} />
            </a>
          </div>
          <hr className="border-white/20" />
          <div>
            <p className="font-semibold text-minto-text mb-1">Option 2 — Ask your CA:</p>
            <p className="text-xs">&quot;Do I have any capital loss carry forward from FY 2024-25?&quot;</p>
          </div>
          <hr className="border-white/20" />
          <div>
            <p className="font-semibold text-minto-text mb-1">You probably don&apos;t if:</p>
            <p className="text-xs">You didn&apos;t sell any investments at a loss in FY 2024-25, or you filed ITR-1 (which doesn&apos;t include capital gains).</p>
          </div>
        </div>

        <p className="text-minto-text-secondary text-sm mb-5 text-center font-medium">Were you able to check?</p>

        <div className="w-full space-y-3 mb-8">
          {[
            { value: "yes" as const, label: "Yes, I have carry-forward losses" },
            { value: "no" as const, label: "No, I don't have any" },
            { value: "not_sure" as const, label: "Skip this for now" },
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

  return (
    <div className="flex-1 flex flex-col items-center justify-center px-6 py-12 max-w-xl mx-auto">
      <h2 className="text-2xl font-bold text-minto-text mb-3 text-center">
        Do you have capital losses from a previous year that you couldn&apos;t fully offset?
      </h2>
      <p className="text-minto-text-secondary text-sm mb-2 text-center">
        Capital losses can be carried forward for up to 8 years. Even losses from FY 2017-18 onwards could still reduce your tax bill this year.
      </p>

      <div className="w-full space-y-3 mb-8 mt-6">
        {[
          { value: "yes" as const, label: "Yes, I have carry-forward losses" },
          { value: "no" as const, label: "No, I don't have any" },
          { value: "not_sure" as const, label: "Not sure — help me check" },
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
