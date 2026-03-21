"use client";

import { CheckCircle, Circle } from "lucide-react";
import { TaxSessionState } from "@/hooks/use-tax-chat";

interface Props {
  sessionState: TaxSessionState;
}

const DOC_LABELS: Record<string, string> = {
  cas: "CAS",
  broker_pl: "Tax P&L",
  broker_holdings: "Holdings",
  itr: "ITR",
};

export function TaxProgressBar({ sessionState }: Props) {
  const needed = sessionState.documents_needed || [];
  const done = sessionState.documents_done || [];

  if (needed.length === 0) return null;

  const doneCount = done.filter((d) => needed.includes(d)).length;
  const pct = needed.length > 0 ? (doneCount / needed.length) * 100 : 0;

  return (
    <div className="px-4 py-2 border-b border-white/20">
      <div className="max-w-5xl mx-auto">
        <div className="flex items-center justify-between mb-1.5">
          <span className="text-xs font-medium text-minto-text-secondary">
            Documents: {doneCount} of {needed.length} collected
          </span>
          <div className="flex items-center gap-2">
            {needed.map((doc) => {
              const isDone = done.includes(doc);
              return (
                <div
                  key={doc}
                  className={`flex items-center gap-1 text-xs ${
                    isDone ? "text-minto-positive" : "text-minto-text-muted"
                  }`}
                >
                  {isDone ? (
                    <CheckCircle size={12} />
                  ) : (
                    <Circle size={12} />
                  )}
                  {DOC_LABELS[doc] || doc}
                </div>
              );
            })}
          </div>
        </div>
        <div className="h-1 bg-white/20 rounded-full overflow-hidden">
          <div
            className="h-full bg-minto-accent transition-all duration-500"
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>
    </div>
  );
}
