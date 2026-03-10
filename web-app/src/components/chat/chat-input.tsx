"use client";

import { useRef, useEffect, KeyboardEvent, useState } from "react";
import { ArrowUp, Mic } from "lucide-react";
import { VoiceChatModal } from "./voice-chat-modal";

interface Props {
  value: string;
  onChange: (value: string) => void;
  onSend: () => void;
  disabled?: boolean;
}

export function ChatInput({ value, onChange, onSend, disabled }: Props) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [isVoiceModalOpen, setIsVoiceModalOpen] = useState(false);

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
    <div className="border-t border-white/25 glass-elevated rounded-t-3xl px-4 py-4">
      <div className="max-w-5xl mx-auto">
        <div className="flex items-end gap-3 bg-white/85 border border-white/70 rounded-[1.5rem] px-5 py-2 shadow-sm">
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
            onClick={() => setIsVoiceModalOpen(true)}
            disabled={disabled}
            className="w-9 h-9 rounded-full bg-minto-accent/10 text-minto-accent flex items-center justify-center shrink-0 disabled:opacity-30 hover:bg-minto-accent/20 transition-colors mb-0.5 mr-1"
          >
            <Mic size={18} />
          </button>
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

      <VoiceChatModal 
        isOpen={isVoiceModalOpen} 
        onClose={() => setIsVoiceModalOpen(false)} 
      />
    </div>
  );
}
