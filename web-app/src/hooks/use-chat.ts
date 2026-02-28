"use client";

import { useState, useEffect, useCallback } from "react";
import { apiGet } from "@/lib/api";
import { apiStream, SSEEvent } from "@/lib/api-stream";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  metadata?: { widgets?: Record<string, unknown>[] };
}

export function useChat() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);

  const loadMessages = useCallback(async () => {
    try {
      const data = await apiGet<{ messages: ChatMessage[] }>("/chat/messages");
      setMessages(data.messages || []);
    } catch {
      setMessages([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadMessages();
  }, [loadMessages]);

  const sendMessage = useCallback(
    async (content: string) => {
      if (!content.trim() || sending) return;
      const text = content.trim();
      setInput("");
      setSending(true);

      // Optimistic: add user message + empty assistant placeholder
      setMessages((prev) => [
        ...prev,
        { role: "user", content: text },
        { role: "assistant", content: "", metadata: {} },
      ]);

      let streamedContent = "";

      try {
        await apiStream(
          "/chat/message/stream",
          { content: text },
          (event: SSEEvent) => {
            if (event.type === "token" && event.content) {
              streamedContent += event.content;
              const updated = streamedContent;
              setMessages((prev) => {
                const copy = [...prev];
                const last = copy.length - 1;
                if (last >= 0 && copy[last].role === "assistant") {
                  copy[last] = { ...copy[last], content: updated };
                }
                return copy;
              });
            }
          }
        );

        // Reload from server to get persisted message with widgets
        const data = await apiGet<{ messages: ChatMessage[] }>("/chat/messages");
        setMessages(data.messages || []);
      } catch {
        setMessages((prev) => {
          const copy = [...prev];
          const last = copy.length - 1;
          if (last >= 0 && copy[last].role === "assistant") {
            copy[last] = {
              role: "assistant",
              content: "Something went wrong. Please try again.",
            };
          }
          return copy;
        });
      } finally {
        setSending(false);
      }
    },
    [sending]
  );

  return { messages, input, setInput, sendMessage, sending, loading };
}
