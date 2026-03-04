"use client";

import { useRef, useEffect, KeyboardEvent } from "react";
import { ArrowUp } from "lucide-react";
import { GlassPanel } from "@/components/ui/glass-panel";

interface Props {
  value: string;
  onChange: (value: string) => void;
  onSend: () => void;
  disabled?: boolean;
}

export function ChatInput({ value, onChange, onSend, disabled }: Props) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const el = textareaRef.current;
    if (el) {
      el.style.height = "auto";
      el.style.height = Math.min(el.scrollHeight, 150) + "px";
    }
  }, [value]);

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (value.trim() && !disabled) onSend();
    }
  };

  return (
    <GlassPanel
      cornerRadius={24}
      padding="16px"
      blurAmount={0.06}
      displacementScale={50}
      elasticity={0.1}
      style={{ borderRadius: "24px 24px 0 0" }}
    >
      <div className="max-w-3xl mx-auto">
        <div className="flex items-end gap-3 bg-white/80 border border-white/60 rounded-[1.5rem] px-5 py-2 shadow-sm">
          <textarea
            ref={textareaRef}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask me anything..."
            disabled={disabled}
            rows={1}
            className="flex-1 bg-transparent text-minto-text text-[15px] placeholder:text-minto-text-muted resize-none focus:outline-none py-2 max-h-[150px]"
          />
          <button
            onClick={onSend}
            disabled={!value.trim() || disabled}
            className="w-9 h-9 rounded-full bg-minto-accent text-white flex items-center justify-center shrink-0 disabled:opacity-30 hover:opacity-90 transition-opacity mb-0.5"
          >
            <ArrowUp size={18} />
          </button>
        </div>
        <p className="text-center text-[10px] text-minto-text-muted mt-2">
          Minto provides informational insights, not investment advice.
        </p>
      </div>
    </GlassPanel>
  );
}
