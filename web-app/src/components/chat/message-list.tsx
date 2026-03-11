"use client";

import { useRef, useEffect, useCallback } from "react";
import { MessageBubble } from "./message-bubble";
import { WidgetPrice } from "./widget-price";
import { WidgetNews } from "./widget-news";
import { WidgetAlertSetup } from "./widget-alert-setup";
import { Spinner } from "@/components/ui/spinner";

interface ChatMessage {
  id?: string;
  role: "user" | "assistant";
  content: string;
  metadata?: { widgets?: Record<string, unknown>[] };
}

interface Props {
  messages: ChatMessage[];
  sending: boolean;
  onLoadOlder?: () => void;
  loadingMore?: boolean;
  hasMore?: boolean;
}

export function MessageList({ messages, sending, onLoadOlder, loadingMore, hasMore }: Props) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const prevHeightRef = useRef(0);
  const isInitialLoad = useRef(true);

  // Auto-scroll to bottom on new messages (but not when loading older)
  useEffect(() => {
    if (isInitialLoad.current) {
      // On first load, scroll to bottom instantly
      bottomRef.current?.scrollIntoView();
      isInitialLoad.current = false;
      return;
    }
    // If we loaded older messages, preserve scroll position
    if (scrollRef.current && prevHeightRef.current > 0) {
      const newHeight = scrollRef.current.scrollHeight;
      const addedHeight = newHeight - prevHeightRef.current;
      if (addedHeight > 0 && scrollRef.current.scrollTop < 100) {
        scrollRef.current.scrollTop = addedHeight;
        prevHeightRef.current = 0;
        return;
      }
    }
    // Otherwise scroll to bottom for new messages
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Detect scroll to top for loading older messages
  const handleScroll = useCallback(() => {
    if (!scrollRef.current || !onLoadOlder || !hasMore || loadingMore) return;
    if (scrollRef.current.scrollTop < 80) {
      prevHeightRef.current = scrollRef.current.scrollHeight;
      onLoadOlder();
    }
  }, [onLoadOlder, hasMore, loadingMore]);

  return (
    <div ref={scrollRef} onScroll={handleScroll} className="flex-1 overflow-y-auto px-4 py-6">
      <div className="max-w-5xl mx-auto">
        {/* Load more indicator */}
        {hasMore && (
          <div className="flex justify-center py-3">
            {loadingMore ? (
              <Spinner size={18} />
            ) : (
              <button
                onClick={onLoadOlder}
                className="text-xs text-minto-text-muted hover:text-minto-text-secondary transition-colors"
              >
                Load earlier messages
              </button>
            )}
          </div>
        )}
        {messages.map((msg, i) => {
          const widgets = (msg.metadata?.widgets || []) as Record<string, unknown>[];
          const isLast = i === messages.length - 1;
          const isEmptyAssistant = msg.role === "assistant" && !msg.content && sending && isLast;

          return (
            <div key={i}>
              <MessageBubble
                role={msg.role}
                content={msg.content}
                isStreaming={isEmptyAssistant}
              />
              {msg.role === "assistant" && widgets.length > 0 && (() => {
                // Aggregate all price and news items across widgets
                const allPrices: Record<string, unknown>[] = [];
                const allNews: Record<string, unknown>[] = [];
                const seenPriceKeys = new Set<string>();
                const seenNewsTitles = new Set<string>();

                let alertSetupData: Record<string, unknown> | null = null;

                for (const w of widgets) {
                  const typed = w as { type: string; data?: Record<string, unknown> & { items?: Record<string, unknown>[] } };
                  const items = typed.data?.items || [];
                  if (typed.type === "price_summary") {
                    for (const item of items) {
                      const key = (item.symbol as string) || String(item.scheme_code) || "";
                      if (key && !seenPriceKeys.has(key)) {
                        seenPriceKeys.add(key);
                        allPrices.push(item);
                      }
                    }
                  } else if (typed.type === "news_summary") {
                    for (const item of items) {
                      const title = (item.title as string) || "";
                      if (title && !seenNewsTitles.has(title)) {
                        seenNewsTitles.add(title);
                        allNews.push(item);
                      }
                    }
                  } else if (typed.type === "alert_setup") {
                    alertSetupData = typed.data || {};
                  }
                }

                return (
                  <div className="ml-11 -mt-3 mb-4">
                    {allPrices.length > 0 && (
                      <WidgetPrice data={{ items: allPrices as never[] }} />
                    )}
                    {allNews.length > 0 && (
                      <WidgetNews data={{ items: allNews as never[] }} />
                    )}
                    {alertSetupData && (
                      <WidgetAlertSetup data={alertSetupData as never} messageId={msg.id} />
                    )}
                  </div>
                );
              })()}
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
