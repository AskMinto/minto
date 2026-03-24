"use client";

import { useState } from "react";
import { Lock, ArrowRight } from "lucide-react";

interface Props {
  filename: string;
  onSubmit: (password: string) => void;
  isLoading?: boolean;
  error?: string;
}

export function PasswordPrompt({ filename, onSubmit, isLoading, error }: Props) {
  const [value, setValue] = useState("");

  const handleSubmit = () => {
    if (value.trim()) onSubmit(value.trim());
  };

  return (
    <div className="inline-flex flex-col gap-3 p-4 rounded-2xl border border-white/30 glass-card max-w-sm w-full">
      <div className="flex items-center gap-2 text-sm text-minto-text">
        <Lock size={14} className="text-minto-accent shrink-0" />
        <span className="font-medium">Password required for {filename}</span>
      </div>
      <p className="text-xs text-minto-text-muted">
        Typically your <strong>PAN</strong> (e.g. ABCDE1234F) or <strong>date of birth</strong> (DDMMYYYY)
      </p>
      {error && (
        <div className="text-xs text-red-600 bg-red-50/60 rounded-lg px-3 py-2">
          {error}
        </div>
      )}
      <div className="flex gap-2">
        <input
          type="password"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && !isLoading && handleSubmit()}
          placeholder="Enter password"
          autoFocus
          className="flex-1 bg-white/70 border border-white/50 rounded-xl px-3 py-2 text-sm text-minto-text placeholder:text-minto-text-muted focus:outline-none focus:ring-1 focus:ring-minto-accent/40"
        />
        <button
          onClick={handleSubmit}
          disabled={!value.trim() || isLoading}
          className="w-9 h-9 rounded-full bg-minto-accent text-white flex items-center justify-center shrink-0 disabled:opacity-40 hover:opacity-90 transition-opacity"
        >
          <ArrowRight size={16} />
        </button>
      </div>
    </div>
  );
}
