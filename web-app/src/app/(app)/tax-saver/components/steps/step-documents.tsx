"use client";

import { useState } from "react";
import { CheckCircle, Upload, AlertCircle, Loader2, ChevronDown, ChevronUp, ExternalLink } from "lucide-react";
import { WizardSessionState, HoldingsContext } from "@/hooks/use-tax-wizard";

interface Props {
  sessionState: WizardSessionState;
  holdingsContext: HoldingsContext | null;
  uploadingDoc: boolean;
  onUploadClick: () => void;
  onAnalyse: () => Promise<void>;
  analysing: boolean;
}

// Download instructions per document type
const DOC_INSTRUCTIONS: Record<string, {
  label: string;
  steps: { text: string; link?: string }[];
  warnings: string[];
}> = {
  cas: {
    label: "MFCentral CAS PDF",
    steps: [
      { text: "Go to mfcentral.com", link: "https://www.mfcentral.com" },
      { text: "Enter your mobile number and OTP" },
      { text: "Go to Reports → Consolidated Account Statement" },
      { text: "Select: Detailed (not Summary) ⚠️" },
      { text: "Check the box: Select All Folios ⚠️" },
      { text: "Period: Apr 2025 to Today" },
      { text: "Set a password for the document (you'll need it when uploading)" },
      { text: "Download the PDF" },
    ],
    warnings: [
      "You must select Detailed — Summary CAS doesn't have transaction history needed to calculate gains.",
      "Check 'Select All Folios' — missing this will exclude some of your funds.",
    ],
  },
  broker_pl: {
    label: "Broker Tax P&L",
    steps: [
      { text: "Zerodha: console.zerodha.com → Reports → Tax P&L → FY 2025-26 → Download CSV", link: "https://console.zerodha.com" },
      { text: "Groww: groww.in → Profile → Reports → Capital Gains → FY 2025-26 → Download", link: "https://groww.in" },
      { text: "Upstox: upstox.com → Reports → P&L → FY 2025-26 → Download CSV", link: "https://upstox.com" },
      { text: "Angel One: angelone.in → My Portfolio → Reports → P&L → FY 2025-26", link: "https://www.angelone.in" },
      { text: "ICICI Direct: icicidirect.com → My Account → Reports → Capital Gain/Loss → FY 2025-26", link: "https://www.icicidirect.com" },
      { text: "Other brokers: look for Reports → Tax P&L or Capital Gains Statement → FY 2025-26" },
    ],
    warnings: [
      "Download as CSV or Excel if available — PDFs are supported but CSV is most accurate.",
      "This must cover FY 2025-26 (Apr 2025 – Mar 2026).",
    ],
  },
  broker_holdings: {
    label: "Broker Holdings Export",
    steps: [
      { text: "Zerodha: console.zerodha.com → Portfolio → Holdings → Download CSV", link: "https://console.zerodha.com" },
      { text: "Groww: groww.in → Stocks → Holdings → Export", link: "https://groww.in" },
      { text: "Upstox: upstox.com → Portfolio → Holdings → Export CSV", link: "https://upstox.com" },
      { text: "Angel One: angelone.in → My Portfolio → Holdings → Download", link: "https://www.angelone.in" },
      { text: "Other brokers: look for Portfolio → Holdings → Download or Export" },
    ],
    warnings: [
      "This shows your current unrealised positions — needed to identify loss harvesting opportunities.",
      "Different from the Tax P&L — make sure you download the Holdings (not P&L) file.",
    ],
  },
  itr: {
    label: "ITR PDF",
    steps: [
      { text: "Go to incometax.gov.in", link: "https://eportal.incometax.gov.in" },
      { text: "Login with PAN + password or Aadhaar OTP" },
      { text: "e-File → Income Tax Returns → View Filed Returns" },
      { text: "Click on AY 2025-26 (filed for FY 2024-25)" },
      { text: "Download the ITR PDF or JSON" },
    ],
    warnings: [
      "We only need Schedule CFL (Carry Forward Losses) from this document.",
      "If you filed ITR-1, it won't have Schedule CFL — you can skip this or enter figures manually.",
    ],
  },
};

function DocInstructions({ docKey }: { docKey: string }) {
  const [open, setOpen] = useState(false);
  const info = DOC_INSTRUCTIONS[docKey];
  if (!info) return null;

  return (
    <div className="mt-2">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 text-xs text-minto-accent hover:underline"
      >
        {open ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
        {open ? "Hide" : "How to download this"}
      </button>

      {open && (
        <div className="mt-3 glass-subtle rounded-xl p-4 space-y-3">
          <ol className="space-y-2">
            {info.steps.map((step, i) => (
              <li key={i} className="flex items-start gap-2 text-xs text-minto-text-secondary">
                <span className="shrink-0 w-4 h-4 rounded-full bg-minto-accent/20 text-minto-accent flex items-center justify-center text-[10px] font-bold mt-0.5">
                  {i + 1}
                </span>
                <span>
                  {step.text}
                  {step.link && (
                    <a
                      href={step.link}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-0.5 text-minto-accent ml-1 hover:underline"
                    >
                      <ExternalLink size={10} />
                    </a>
                  )}
                </span>
              </li>
            ))}
          </ol>
          {info.warnings.length > 0 && (
            <div className="space-y-1 pt-2 border-t border-white/20">
              {info.warnings.map((w, i) => (
                <p key={i} className="text-xs text-amber-600 flex items-start gap-1.5">
                  <span className="shrink-0 mt-0.5">⚠️</span>
                  {w}
                </p>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function StepDocuments({
  sessionState,
  holdingsContext,
  uploadingDoc,
  onUploadClick,
  onAnalyse,
  analysing,
}: Props) {
  const needed = sessionState.documents_needed || [];
  const done = sessionState.documents_done || [];
  const allDone = needed.length > 0 && needed.every((d) => done.includes(d));
  const doneCount = done.filter((d) => needed.includes(d)).length;

  return (
    <div className="flex-1 flex flex-col items-center justify-start px-6 py-10 max-w-xl mx-auto w-full">
      <h2 className="text-2xl font-bold text-minto-text mb-2 text-center">
        Collect your documents
      </h2>
      <p className="text-minto-text-secondary text-sm mb-6 text-center">
        I need {needed.length} document{needed.length !== 1 ? "s" : ""} to build your tax plan.
        {doneCount > 0 ? ` ${doneCount} of ${needed.length} done.` : ""}
      </p>

      {/* Existing holdings banner */}
      {holdingsContext?.has_holdings && holdingsContext.summary && (
        <div className="glass-subtle rounded-2xl px-4 py-3 mb-5 w-full flex items-start gap-3">
          <CheckCircle size={16} className="text-minto-positive shrink-0 mt-0.5" />
          <p className="text-xs text-minto-text-secondary">
            {holdingsContext.summary.message}
          </p>
        </div>
      )}

      {/* Document list with inline download instructions */}
      <div className="w-full space-y-3 mb-8">
        {needed.map((docKey) => {
          const info = DOC_INSTRUCTIONS[docKey];
          const isDone = done.includes(docKey);
          return (
            <div
              key={docKey}
              className={`rounded-2xl border px-5 py-4 transition-all ${
                isDone
                  ? "border-minto-positive/40 bg-minto-positive/5"
                  : "border-white/20 bg-white/5"
              }`}
            >
              <div className="flex items-start gap-3">
                {isDone ? (
                  <CheckCircle size={18} className="text-minto-positive shrink-0 mt-0.5" />
                ) : (
                  <div className="w-[18px] h-[18px] rounded-full border-2 border-white/30 shrink-0 mt-0.5" />
                )}
                <div className="flex-1 min-w-0">
                  <p className={`text-sm font-medium ${isDone ? "text-minto-positive" : "text-minto-text"}`}>
                    {info?.label || docKey}
                  </p>
                  {isDone ? (
                    <p className="text-xs text-minto-positive/80 mt-0.5">Parsed successfully</p>
                  ) : (
                    <DocInstructions docKey={docKey} />
                  )}
                </div>
              </div>
            </div>
          );
        })}

        {needed.length === 0 && (
          <div className="flex items-center gap-3 glass-subtle rounded-2xl px-4 py-4">
            <AlertCircle size={16} className="text-minto-text-muted shrink-0" />
            <p className="text-xs text-minto-text-muted">
              No documents required based on your selections. You can proceed to analysis.
            </p>
          </div>
        )}
      </div>

      {/* Upload button */}
      {!allDone && (
        <button
          onClick={onUploadClick}
          disabled={uploadingDoc}
          className="w-full border-2 border-dashed border-minto-accent/50 rounded-2xl py-4 flex items-center justify-center gap-2 text-minto-accent text-sm font-medium hover:bg-minto-accent/5 transition-colors mb-6 disabled:opacity-50"
        >
          {uploadingDoc ? (
            <Loader2 size={16} className="animate-spin" />
          ) : (
            <Upload size={16} />
          )}
          {uploadingDoc ? "Parsing document…" : "Upload document"}
        </button>
      )}

      {/* DPDPA privacy note */}
      <div className="glass-subtle rounded-2xl px-4 py-3 mb-8 text-xs text-minto-text-muted w-full">
        🔒 Raw files are deleted within 60 seconds of parsing. Only derived summary figures are stored (DPDPA 2023 compliant).
      </div>

      {/* Analyse button */}
      <button
        onClick={onAnalyse}
        disabled={(!allDone && needed.length > 0) || analysing}
        className="bg-minto-accent text-white w-full py-4 rounded-full font-semibold hover:opacity-90 transition-opacity text-sm disabled:opacity-40 flex items-center justify-center gap-2"
      >
        {analysing ? (
          <>
            <Loader2 size={16} className="animate-spin" />
            Calculating your tax plan…
          </>
        ) : (
          "Build my tax plan →"
        )}
      </button>

      {!allDone && needed.length > 0 && (
        <p className="text-xs text-minto-text-muted mt-3 text-center">
          Upload all {needed.length} documents first
        </p>
      )}
    </div>
  );
}
