"use client";

import { useState } from "react";
import { Check } from "lucide-react";

export interface IntakeWidgetOption {
  label: string;
  value: string;
}

export interface IntakeWidgetData {
  field: string;
  question: string;
  options: IntakeWidgetOption[];
  multi: boolean;
}

interface Props {
  widget: IntakeWidgetData;
  onSubmit: (message: string) => void;
  disabled?: boolean;
}

export function WidgetIntake({ widget, onSubmit, disabled }: Props) {
  const [selected, setSelected] = useState<string[]>([]);
  const [submitted, setSubmitted] = useState(false);

  const toggle = (value: string) => {
    if (widget.multi) {
      setSelected((prev) =>
        prev.includes(value) ? prev.filter((v) => v !== value) : [...prev, value]
      );
    } else {
      // Single select — submit immediately
      setSelected([value]);
      setSubmitted(true);
      const opt = widget.options.find((o) => o.value === value);
      onSubmit(opt?.label ?? value);
    }
  };

  const handleMultiSubmit = () => {
    if (!selected.length) return;
    setSubmitted(true);
    const labels = selected
      .map((v) => widget.options.find((o) => o.value === v)?.label ?? v)
      .join(", ");
    onSubmit(labels);
  };

  if (submitted) {
    const labels = selected
      .map((v) => widget.options.find((o) => o.value === v)?.label ?? v)
      .join(", ");
    return (
      <div className="flex items-center gap-2 mt-2 mb-1">
        <div className="w-5 h-5 rounded-full bg-minto-accent/15 flex items-center justify-center shrink-0">
          <Check size={11} className="text-minto-accent" />
        </div>
        <span className="text-sm text-minto-text-muted">{labels}</span>
      </div>
    );
  }

  return (
    <div className="mt-3 mb-1 ml-11">
      <div className="flex flex-wrap gap-2">
        {widget.options.map((opt) => {
          const isSelected = selected.includes(opt.value);
          return (
            <button
              key={opt.value}
              onClick={() => !disabled && toggle(opt.value)}
              disabled={disabled}
              className={`px-4 py-2 rounded-2xl text-sm font-medium border transition-all duration-150 disabled:opacity-40 ${
                isSelected
                  ? "bg-minto-accent text-white border-minto-accent shadow-sm"
                  : "bg-white/70 text-minto-text border-white/50 hover:bg-white/90 hover:border-minto-accent/30"
              }`}
            >
              {isSelected && widget.multi && <Check size={12} className="inline mr-1.5 -mt-0.5" />}
              {opt.label}
            </button>
          );
        })}
      </div>
      {widget.multi && selected.length > 0 && (
        <button
          onClick={handleMultiSubmit}
          disabled={disabled}
          className="mt-3 px-5 py-2 rounded-2xl bg-minto-accent text-white text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-40"
        >
          Confirm ({selected.length} selected)
        </button>
      )}
    </div>
  );
}
