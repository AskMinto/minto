"use client";

import { useRef, useEffect, useState, KeyboardEvent } from "react";
import Image from "next/image";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { ArrowUp, RotateCcw, Loader2 } from "lucide-react";
import type { ChatMessage } from "@/hooks/use-tax-saver";

interface Props {
  messages: ChatMessage[];
  sending: boolean;
  onSendFollowUp: (content: string) => void;
  onStartOver: () => void;
  onBackToUpload: () => void;
}

export function AnalysisStream({
  messages,
  sending,
  onSendFollowUp,
  onStartOver,
  onBackToUpload,
}: Props) {
  const [input, setInput] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    const el = textareaRef.current;
    if (el) {
      el.style.height = "auto";
      el.style.height = Math.min(el.scrollHeight, 150) + "px";
    }
  }, [input]);

  const handleSend = () => {
    if (input.trim() && !sending) {
      onSendFollowUp(input.trim());
      setInput("");
    }
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const isAnalysing = messages.length === 1 && messages[0].role === "assistant" && !messages[0].content && sending;

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {/* Message list */}
      <div className="flex-1 overflow-y-auto px-4 py-6">
        <div className="max-w-3xl mx-auto">
          {/* Analysing indicator */}
          {isAnalysing && (
            <div className="flex gap-3 mb-6">
              <div className="shrink-0 w-8 h-8 rounded-full glass-card flex items-center justify-center mt-1">
                <Image src="/minto.png" alt="Minto" width={20} height={20} />
              </div>
              <div className="glass-card rounded-2xl rounded-bl-md px-5 py-4">
                <div className="flex items-center gap-2 text-sm text-minto-text-muted">
                  <Loader2 size={14} className="animate-spin" />
                  Analysing your tax documents...
                </div>
              </div>
            </div>
          )}

          {messages.map((msg, i) => {
            const isLast = i === messages.length - 1;
            const isStreamingEmpty =
              msg.role === "assistant" && !msg.content && sending && isLast;
            return (
              <MessageBubble key={i} message={msg} isStreaming={isStreamingEmpty && i > 0} />
            );
          })}
          <div ref={bottomRef} />
        </div>
      </div>

      {/* Follow-up input — only shown after analysis is done */}
      {messages.length > 0 && messages[0].content && (
        <div className="border-t border-white/25 glass-elevated rounded-t-3xl px-4 py-4">
          <div className="max-w-3xl mx-auto">
            <div className="flex items-end gap-3 bg-white/85 border border-white/70 rounded-[1.5rem] px-5 py-2 shadow-sm">
              <textarea
                ref={textareaRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={
                  sending
                    ? "Thinking..."
                    : "Ask a follow-up question about your tax analysis..."
                }
                disabled={sending}
                rows={1}
                className="flex-1 bg-transparent text-minto-text text-[15px] placeholder:text-minto-text-muted resize-none focus:outline-none py-2 max-h-[150px]"
              />
              <button
                onClick={handleSend}
                disabled={!input.trim() || sending}
                className="w-9 h-9 rounded-full bg-minto-accent text-white flex items-center justify-center shrink-0 disabled:opacity-30 hover:opacity-90 transition-opacity mb-0.5"
              >
                <ArrowUp size={18} />
              </button>
            </div>
            <div className="flex items-center justify-between mt-2">
              <p className="text-[10px] text-minto-text-muted">
                Minto provides informational insights, not tax advice. Consult a CA for your final liability.
              </p>
              <div className="flex items-center gap-3">
                <button
                  onClick={onBackToUpload}
                  className="text-[10px] text-minto-text-muted hover:text-minto-text transition-colors"
                >
                  ← Upload more docs
                </button>
                <button
                  onClick={onStartOver}
                  className="flex items-center gap-1 text-[10px] text-minto-text-muted hover:text-minto-text transition-colors"
                >
                  <RotateCcw size={10} />
                  Start over
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function MessageBubble({
  message,
  isStreaming,
}: {
  message: ChatMessage;
  isStreaming?: boolean;
}) {
  const { role, content } = message;

  if (role === "status") {
    return (
      <div className="flex justify-center mb-3">
        <div className="text-xs text-minto-text-muted glass-subtle px-3 py-1.5 rounded-full">
          {content}
        </div>
      </div>
    );
  }

  if (role === "user") {
    return (
      <div className="flex justify-end mb-6">
        <div className="bg-white/95 rounded-3xl rounded-br-md px-5 py-4 max-w-[75%] shadow-[0_2px_8px_rgba(0,0,0,0.06)]">
          <p className="text-minto-text text-[15px] leading-relaxed whitespace-pre-wrap">{content}</p>
        </div>
      </div>
    );
  }

  // Assistant bubble
  return (
    <div className="flex gap-3 mb-6">
      <div className="shrink-0 w-8 h-8 rounded-full glass-card flex items-center justify-center mt-1">
        <Image src="/minto.png" alt="Minto" width={20} height={20} />
      </div>
      <div className="flex-1 min-w-0 max-w-[92%]">
        {!content && isStreaming ? (
          <div className="glass-card inline-flex items-center gap-1.5 px-4 py-3 rounded-2xl rounded-bl-md">
            <span className="w-2 h-2 rounded-full bg-minto-accent/40 animate-[bounce_1.4s_ease-in-out_infinite]" />
            <span className="w-2 h-2 rounded-full bg-minto-accent/40 animate-[bounce_1.4s_ease-in-out_0.2s_infinite]" />
            <span className="w-2 h-2 rounded-full bg-minto-accent/40 animate-[bounce_1.4s_ease-in-out_0.4s_infinite]" />
          </div>
        ) : (
          <div className="chat-markdown text-minto-text text-[15px] leading-relaxed">
            {content && (
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                components={{
                  a: ({ children, href }) => (
                    <a href={href} target="_blank" rel="noopener noreferrer">
                      {children}
                    </a>
                  ),
                }}
              >
                {content}
              </ReactMarkdown>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
