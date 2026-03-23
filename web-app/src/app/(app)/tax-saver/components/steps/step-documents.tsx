"use client";

import { CheckCircle, Upload, AlertCircle, Loader2 } from "lucide-react";
import { WizardSessionState, HoldingsContext } from "@/hooks/use-tax-wizard";

interface Props {
  sessionState: WizardSessionState;
  holdingsContext: HoldingsContext | null;
  uploadingDoc: boolean;
  onUploadClick: () => void;
  onAnalyse: () => Promise<void>;
  analysing: boolean;
}

const DOC_INFO: Record<string, { label: string; hint: string }> = {
  cas: {
    label: "MFCentral CAS PDF",
    hint: "Detailed CAS from mfcentral.com · Set a password when downloading",
  },
  broker_pl: {
    label: "Broker Tax P&L",
    hint: "CSV, Excel or PDF from your broker's Tax P&L / Capital Gains section · FY 2025-26",
  },
  broker_holdings: {
    label: "Broker Holdings",
    hint: "CSV, Excel or PDF of your current holdings from your broker",
  },
  itr: {
    label: "ITR PDF",
    hint: "ITR-2 or ITR-3 from incometax.gov.in · AY 2025-26 · Schedule CFL section",
  },
};

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

      {/* Document list */}
      <div className="w-full space-y-3 mb-8">
        {needed.map((docKey) => {
          const info = DOC_INFO[docKey];
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
                  {!isDone && info?.hint && (
                    <p className="text-xs text-minto-text-muted mt-0.5">{info.hint}</p>
                  )}
                  {isDone && (
                    <p className="text-xs text-minto-positive/80 mt-0.5">Parsed successfully</p>
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
        Message &quot;Delete my data&quot; in the chat to erase everything immediately.
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
