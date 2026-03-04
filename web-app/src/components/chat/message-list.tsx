"use client";

import { useRef, useEffect } from "react";
import { MessageBubble } from "./message-bubble";
import { WidgetPrice } from "./widget-price";
import { WidgetNews } from "./widget-news";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  metadata?: { widgets?: Record<string, unknown>[] };
}

interface Props {
  messages: ChatMessage[];
  sending: boolean;
}

export function MessageList({ messages, sending }: Props) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  return (
    <div className="flex-1 overflow-y-auto px-4 py-6">
      <div className="max-w-5xl mx-auto">
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

                for (const w of widgets) {
                  const typed = w as { type: string; data?: { items?: Record<string, unknown>[] } };
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
