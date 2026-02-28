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
      <div className="max-w-3xl mx-auto">
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
              {msg.role === "assistant" && widgets.length > 0 && (
                <div className="ml-11 -mt-3 mb-4">
                  {widgets.map((w, wi) => {
                    if ((w as { type: string }).type === "price_summary") {
                      return <WidgetPrice key={wi} data={(w as { data: { items: [] } }).data} />;
                    }
                    if ((w as { type: string }).type === "news_summary") {
                      return <WidgetNews key={wi} data={(w as { data: { items: [] } }).data} />;
                    }
                    return null;
                  })}
                </div>
              )}
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
