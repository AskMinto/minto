"use client";

import { useRef, useEffect, useState, KeyboardEvent, useMemo } from "react";
import Image from "next/image";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { ArrowUp, RotateCcw, Loader2, TrendingUp, TrendingDown, AlertTriangle, Clock, Lock, CheckCircle } from "lucide-react";
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
                <div className="flex items-center gap-2 text-sm text-minto-text/80">
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
                className="flex-1 bg-transparent text-minto-text text-[15px] placeholder:text-minto-text/80 resize-none focus:outline-none py-2 max-h-[150px]"
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
              <p className="text-[10px] text-minto-text/80">
                Minto provides informational insights, not tax advice. Consult a CA for your final liability.
              </p>
              <div className="flex items-center gap-3">
                <button
                  onClick={onBackToUpload}
                  className="text-[10px] text-minto-text/80 hover:text-minto-text transition-colors"
                >
                  ← Upload more docs
                </button>
                <button
                  onClick={onStartOver}
                  className="flex items-center gap-1 text-[10px] text-minto-text/80 hover:text-minto-text transition-colors"
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
        <div className="text-xs text-minto-text/80 glass-subtle px-3 py-1.5 rounded-full">
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
        ) : content ? (
          <TaxAnalysisContent content={content} isStreaming={isStreaming} />
        ) : null}
      </div>
    </div>
  );
}

// ── Option 1: custom ReactMarkdown components ──────────────────────────────────

function rupeeColour(text: string): string {
  if (/[-−][\s]*[₹\d]/.test(text) || text.includes("(loss)") || text.includes("LTCL") || text.includes("STCL")) return "text-red-500";
  if (/₹[\d,]+/.test(text)) return "text-emerald-600";
  return "";
}

const TaxMarkdown = ({ content }: { content: string }) => (
  <ReactMarkdown
    remarkPlugins={[remarkGfm]}
    components={{
      // Section headers — styled with accent underline
      h2: ({ children }) => (
        <h2 className="text-[15px] font-semibold text-minto-text mt-5 mb-2 pb-1.5 border-b border-minto-accent/25 flex items-center gap-2">
          {children}
        </h2>
      ),
      h3: ({ children }) => (
        <h3 className="text-[14px] font-semibold text-minto-text mt-3 mb-1.5">{children}</h3>
      ),
      // Tables — styled financial data table
      table: ({ children }) => (
        <div className="overflow-x-auto my-3 rounded-xl border border-white/20">
          <table className="w-full text-[13px] border-collapse">{children}</table>
        </div>
      ),
      thead: ({ children }) => (
        <thead className="bg-minto-accent/8">{children}</thead>
      ),
      th: ({ children }) => (
        <th className="px-3 py-2 text-left text-[12px] font-semibold text-minto-text/70 uppercase tracking-wide whitespace-nowrap">
          {children}
        </th>
      ),
      tr: ({ children }) => (
        <tr className="border-t border-white/10 hover:bg-white/5 transition-colors">{children}</tr>
      ),
      td: ({ children }) => {
        const text = String(children ?? "");
        const colour = rupeeColour(text);
        return (
          <td className={`px-3 py-2 text-[13px] ${colour || "text-minto-text"} whitespace-nowrap`}>
            {children}
          </td>
        );
      },
      // Inline code — subtle pill
      code: ({ children }) => (
        <code className="bg-white/30 text-minto-accent text-[12px] px-1.5 py-0.5 rounded font-mono">
          {children}
        </code>
      ),
      // Blockquote — info callout
      blockquote: ({ children }) => (
        <blockquote className="border-l-2 border-minto-accent/40 pl-3 my-2 text-minto-text/70 text-[14px] italic">
          {children}
        </blockquote>
      ),
      // Strong — make rupee amounts pop
      strong: ({ children }) => {
        const text = String(children ?? "");
        const colour = rupeeColour(text);
        return <strong className={`font-semibold ${colour || "text-minto-text"}`}>{children}</strong>;
      },
      a: ({ children, href }) => (
        <a href={href} target="_blank" rel="noopener noreferrer" className="text-minto-accent underline">
          {children}
        </a>
      ),
      // List items
      ul: ({ children }) => <ul className="my-1.5 space-y-0.5 pl-4">{children}</ul>,
      ol: ({ children }) => <ol className="my-1.5 space-y-0.5 pl-4 list-decimal">{children}</ol>,
      li: ({ children }) => <li className="text-[14px] text-minto-text leading-relaxed list-disc marker:text-minto-accent/60">{children}</li>,
      p: ({ children }) => <p className="text-[14px] text-minto-text leading-relaxed mb-2">{children}</p>,
    }}
  >
    {content}
  </ReactMarkdown>
);

// ── Option 2: parse completed content into section cards ──────────────────────

type ActionType = "HARVEST_LOSS" | "BOOK_LTCG_EXEMPTION" | "AVOID_SELL" | "UPGRADE_TERM" | "ELSS_REMINDER";

interface ParsedAction {
  action_type: ActionType;
  priority: "HIGH" | "MEDIUM" | "LOW";
  instrument_name: string;
  current_pnl: string;
  tax_saving_estimate: string;
  rationale: string;
  suggested_deadline: string;
  caveat: string;
}

const ACTION_META: Record<ActionType, { icon: React.ReactNode; colour: string; label: string }> = {
  HARVEST_LOSS:        { icon: <TrendingDown size={13} />, colour: "text-red-500 bg-red-500/10 border-red-500/20",    label: "Harvest Loss" },
  BOOK_LTCG_EXEMPTION: { icon: <TrendingUp size={13} />,   colour: "text-emerald-600 bg-emerald-500/10 border-emerald-500/20", label: "Book LTCG Exemption" },
  AVOID_SELL:          { icon: <AlertTriangle size={13} />, colour: "text-amber-600 bg-amber-500/10 border-amber-500/20", label: "Avoid Selling" },
  UPGRADE_TERM:        { icon: <Clock size={13} />,         colour: "text-blue-500 bg-blue-500/10 border-blue-500/20",   label: "Wait for LTCG" },
  ELSS_REMINDER:       { icon: <Lock size={13} />,          colour: "text-purple-500 bg-purple-500/10 border-purple-500/20", label: "ELSS Lock-in" },
};

const PRIORITY_BADGE: Record<string, string> = {
  HIGH:   "bg-red-500/15 text-red-600 border border-red-500/20",
  MEDIUM: "bg-amber-500/15 text-amber-600 border border-amber-500/20",
  LOW:    "bg-slate-500/15 text-slate-500 border border-slate-500/20",
};

/**
 * Parse action rows from a markdown table in the ACTION PLAN section.
 * Handles the pipe table format the agent outputs.
 */
function parseActionTable(sectionContent: string): ParsedAction[] {
  const lines = sectionContent.split("\n").filter(l => l.trim().startsWith("|"));
  if (lines.length < 3) return []; // need header + separator + at least one row

  const headers = lines[0].split("|").map(h => h.trim().toLowerCase().replace(/\s+/g, "_")).filter(Boolean);
  const rows = lines.slice(2); // skip header and separator

  return rows.map(row => {
    const cells = row.split("|").map(c => c.trim()).filter(Boolean);
    const get = (key: string) => cells[headers.indexOf(key)] ?? "";
    return {
      action_type: (get("action_type").replace(/\*\*/g, "") || "HARVEST_LOSS") as ActionType,
      priority: (get("priority").replace(/\*\*/g, "").toUpperCase() || "MEDIUM") as ParsedAction["priority"],
      instrument_name: get("instrument_name").replace(/\*\*/g, ""),
      current_pnl: get("current_pnl"),
      tax_saving_estimate: get("tax_saving_estimate"),
      rationale: get("rationale"),
      suggested_deadline: get("suggested_deadline"),
      caveat: get("caveat"),
    };
  }).filter(a => a.instrument_name);
}

function ActionCard({ action }: { action: ParsedAction }) {
  const meta = ACTION_META[action.action_type] ?? ACTION_META.HARVEST_LOSS;
  const priorityClass = PRIORITY_BADGE[action.priority] ?? PRIORITY_BADGE.MEDIUM;

  return (
    <div className={`rounded-xl border p-4 mb-3 ${meta.colour}`}>
      <div className="flex items-start justify-between gap-3 mb-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className={`shrink-0 p-1 rounded-full ${meta.colour}`}>{meta.icon}</span>
          <div className="min-w-0">
            <span className="text-[11px] font-semibold uppercase tracking-wide opacity-70">{meta.label}</span>
            <p className="text-[14px] font-semibold truncate">{action.instrument_name}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {action.tax_saving_estimate && (
            <span className="text-[12px] font-semibold text-emerald-600 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-full whitespace-nowrap">
              Save {action.tax_saving_estimate}
            </span>
          )}
          <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full uppercase ${priorityClass}`}>
            {action.priority}
          </span>
        </div>
      </div>
      {action.current_pnl && (
        <p className="text-[12px] opacity-70 mb-1.5">
          Unrealised P&L: <span className={action.current_pnl.includes("-") ? "text-red-500 font-medium" : "text-emerald-600 font-medium"}>{action.current_pnl}</span>
        </p>
      )}
      <p className="text-[13px] leading-relaxed mb-1.5">{action.rationale}</p>
      <div className="flex items-center justify-between gap-3 flex-wrap">
        {action.suggested_deadline && (
          <span className="flex items-center gap-1 text-[11px] opacity-60">
            <Clock size={10} /> {action.suggested_deadline}
          </span>
        )}
        {action.caveat && (
          <span className="text-[11px] opacity-60 italic">{action.caveat}</span>
        )}
      </div>
    </div>
  );
}

/**
 * Split completed content into named sections by ## heading.
 * Returns array of {title, content} objects.
 */
function splitIntoSections(content: string): { title: string; content: string }[] {
  const parts = content.split(/^#{2}\s+/m);
  return parts
    .filter(p => p.trim())
    .map(p => {
      const newline = p.indexOf("\n");
      return {
        title: (newline > 0 ? p.slice(0, newline) : p).trim().toUpperCase(),
        content: newline > 0 ? p.slice(newline + 1).trim() : "",
      };
    });
}

/**
 * Main content component — streams with Option 1 styling,
 * then pops into Section cards (Option 2) once streaming is done.
 */
function TaxAnalysisContent({ content, isStreaming }: { content: string; isStreaming?: boolean }) {
  const sections = useMemo(() => {
    if (isStreaming) return null;
    return splitIntoSections(content);
  }, [content, isStreaming]);

  // While streaming: Option 1 — styled ReactMarkdown
  if (isStreaming || !sections) {
    return (
      <div className="tax-analysis-streaming">
        <TaxMarkdown content={content} />
      </div>
    );
  }

  // Done streaming: Option 2 — render each section as a card
  return (
    <div className="space-y-1">
      {sections.map((section, i) => {
        const isActionPlan = section.title.includes("ACTION");
        const isTaxSummary = section.title.includes("TAX SUMMARY") || section.title.includes("SUMMARY");
        const isDeadline = section.title.includes("DEADLINE");

        if (isActionPlan) {
          const actions = parseActionTable(section.content);
          return (
            <div key={i} className="glass-card rounded-2xl p-4 mb-3">
              <h2 className="text-[14px] font-semibold text-minto-text mb-3 pb-1.5 border-b border-minto-accent/25 flex items-center gap-2">
                <CheckCircle size={14} className="text-minto-accent" />
                Action Plan
              </h2>
              {actions.length > 0
                ? actions.map((a, j) => <ActionCard key={j} action={a} />)
                : <TaxMarkdown content={section.content} />}
            </div>
          );
        }

        if (isTaxSummary) {
          return (
            <div key={i} className="glass-card rounded-2xl p-4 mb-3">
              <h2 className="text-[14px] font-semibold text-minto-text mb-3 pb-1.5 border-b border-minto-accent/25">
                📊 Tax Summary
              </h2>
              <TaxMarkdown content={section.content} />
            </div>
          );
        }

        if (isDeadline) {
          return (
            <div key={i} className="rounded-2xl border border-amber-400/30 bg-amber-400/8 px-4 py-3 mb-3">
              <TaxMarkdown content={`## ${section.title}\n${section.content}`} />
            </div>
          );
        }

        // Default section card
        return (
          <div key={i} className="glass-card rounded-2xl p-4 mb-3">
            <TaxMarkdown content={`## ${section.title}\n${section.content}`} />
          </div>
        );
      })}
    </div>
  );
}
