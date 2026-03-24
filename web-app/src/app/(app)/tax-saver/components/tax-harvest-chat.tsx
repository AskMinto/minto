"use client";

import { useRef, useEffect, useState, KeyboardEvent } from "react";
import Image from "next/image";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { ArrowUp, RotateCcw } from "lucide-react";
import { useTaxHarvest } from "@/hooks/use-tax-harvest";
import type { TaxHarvestMessage, AnalysisPayload } from "@/hooks/use-tax-harvest";
import { TaxAnalysisCard } from "./tax-analysis-card";
import { DocumentUploadButton } from "./document-upload-button";
import { WidgetIntake } from "./widget-intake";

export function TaxHarvestChat() {
  const {
    messages,
    sessionState,
    sending,
    uploading,
    loading,
    sendMessage,
    uploadDocument,
    startOver,
  } = useTaxHarvest();

  const [input, setInput] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const inputAreaRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Auto-resize textarea
  useEffect(() => {
    const el = textareaRef.current;
    if (el) {
      el.style.height = "auto";
      el.style.height = Math.min(el.scrollHeight, 150) + "px";
    }
  }, [input]);

  const handleSend = () => {
    if (input.trim() && !sending) {
      sendMessage(input.trim());
      setInput("");
    }
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="flex gap-1.5">
          <span className="w-2 h-2 rounded-full bg-minto-accent/40 animate-[bounce_1.4s_ease-in-out_infinite]" />
          <span className="w-2 h-2 rounded-full bg-minto-accent/40 animate-[bounce_1.4s_ease-in-out_0.2s_infinite]" />
          <span className="w-2 h-2 rounded-full bg-minto-accent/40 animate-[bounce_1.4s_ease-in-out_0.4s_infinite]" />
        </div>
      </div>
    );
  }

  const showWelcome = messages.length === 0;

  return (
    <div className="flex-1 flex flex-col min-h-0">
      {/* Message list */}
      <div className="flex-1 overflow-y-auto px-4 py-6">
        <div className="max-w-3xl mx-auto">
          {showWelcome && <WelcomeScreen onStart={() => sendMessage("Hi! Let's start.")} />}

          {messages.map((msg, i) => {
            const isLast = i === messages.length - 1;
            const isStreamingEmpty = msg.role === "assistant" && !msg.content && sending && isLast;
            return (
              <div key={i}>
                <MessageBubble
                  message={msg}
                  isStreaming={isStreamingEmpty}
                />
                {msg.role === "assistant" && msg.intakeWidget && isLast && !sending && (
                  <WidgetIntake
                    widget={msg.intakeWidget}
                    onSubmit={(answer) => sendMessage(answer)}
                    disabled={sending}
                  />
                )}
              </div>
            );
          })}
          <div ref={bottomRef} />
        </div>
      </div>

      {/* Input area */}
      <div className="border-t border-white/25 glass-elevated rounded-t-3xl px-4 py-4">
        <div className="max-w-3xl mx-auto relative">
          <div className="flex items-end gap-3 bg-white/85 border border-white/70 rounded-[1.5rem] px-5 py-2 shadow-sm" ref={inputAreaRef}>
            <DocumentUploadButton
              onUpload={uploadDocument}
              disabled={sending}
              uploading={uploading}
            />
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={sending ? "Thinking..." : "Type a message or upload a document..."}
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
            {messages.length > 0 && (
              <button
                onClick={startOver}
                className="flex items-center gap-1 text-[10px] text-minto-text-muted hover:text-minto-text transition-colors"
              >
                <RotateCcw size={10} />
                Start over
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function WelcomeScreen({ onStart }: { onStart: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
      <div className="w-16 h-16 rounded-full glass-card flex items-center justify-center mb-6">
        <Image src="/minto.png" alt="Minto" width={40} height={40} />
      </div>
      <h1 className="text-2xl font-semibold text-minto-text mb-2">Tax Harvesting Analyser</h1>
      <p className="text-minto-text-muted text-sm max-w-md mb-8 leading-relaxed">
        I&apos;ll guide you through calculating your FY 2025-26 capital gains tax and generating
        a personalised loss harvesting and gains harvesting plan before March 31st.
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 max-w-2xl w-full mb-8">
        {[
          { icon: "📋", title: "Quick Intake", desc: "Income slab, regime, and broker details" },
          { icon: "📄", title: "Document Upload", desc: "CAS PDF, Zerodha XLSX, or Groww CSV" },
          { icon: "💰", title: "Tax Analysis", desc: "LTCG/STCG computation + harvest plan" },
        ].map((step) => (
          <div key={step.title} className="glass-subtle rounded-xl p-4 text-left">
            <div className="text-2xl mb-2">{step.icon}</div>
            <div className="text-sm font-medium text-minto-text mb-1">{step.title}</div>
            <div className="text-xs text-minto-text-muted">{step.desc}</div>
          </div>
        ))}
      </div>
      <button
        onClick={onStart}
        className="bg-minto-accent text-white rounded-2xl px-8 py-3 text-sm font-medium hover:opacity-90 transition-opacity"
      >
        Start Tax Analysis →
      </button>
      <p className="text-[10px] text-minto-text-muted mt-4">
        Raw documents are deleted from servers within 60 seconds of parsing (DPDPA compliant)
      </p>
    </div>
  );
}

function MessageBubble({
  message,
  isStreaming,
}: {
  message: TaxHarvestMessage;
  isStreaming?: boolean;
}) {
  const { role, content, analysisPayload } = message;

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
      <div className="flex-1 min-w-0 max-w-[90%]">
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
            {analysisPayload && <TaxAnalysisCard payload={analysisPayload} />}
          </div>
        )}
      </div>
    </div>
  );
}
