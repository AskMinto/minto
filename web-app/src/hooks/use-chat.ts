"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { apiGet } from "@/lib/api";
import { apiStream, SSEEvent } from "@/lib/api-stream";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  created_at?: string;
  metadata?: { widgets?: Record<string, unknown>[] };
}

const PAGE_SIZE = 8; // ~4 conversation pairs

export function useChat() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const loadedRef = useRef(false);

  const loadMessages = useCallback(async () => {
    try {
      const data = await apiGet<{ messages: ChatMessage[]; has_more: boolean }>(
        `/chat/messages?limit=${PAGE_SIZE}`
      );
      setMessages(data.messages || []);
      setHasMore(data.has_more ?? false);
    } catch {
      setMessages([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!loadedRef.current) {
      loadedRef.current = true;
      loadMessages();
    }
  }, [loadMessages]);

  const loadOlder = useCallback(async () => {
    if (loadingMore || !hasMore || messages.length === 0) return;
    const oldest = messages[0]?.created_at;
    if (!oldest) return;

    setLoadingMore(true);
    try {
      const data = await apiGet<{ messages: ChatMessage[]; has_more: boolean }>(
        `/chat/messages?limit=${PAGE_SIZE}&before=${encodeURIComponent(oldest)}`
      );
      const older = data.messages || [];
      if (older.length > 0) {
        setMessages((prev) => [...older, ...prev]);
      }
      setHasMore(data.has_more ?? false);
    } catch {
      // silently fail
    } finally {
      setLoadingMore(false);
    }
  }, [loadingMore, hasMore, messages]);

  const sendMessage = useCallback(
    async (content: string) => {
      if (!content.trim() || sending) return;
      const text = content.trim();
      setInput("");
      setSending(true);

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

        // Reload latest page to get persisted message with widgets
        const data = await apiGet<{ messages: ChatMessage[]; has_more: boolean }>(
          `/chat/messages?limit=${PAGE_SIZE}`
        );
        // Merge: keep older loaded messages, replace the latest page
        setMessages((prev) => {
          const latestMessages = data.messages || [];
          if (prev.length <= PAGE_SIZE) return latestMessages;
          // Keep everything before the latest page
          const olderCount = prev.length - PAGE_SIZE - 2; // -2 for the optimistic messages we added
          const older = prev.slice(0, Math.max(0, olderCount));
          return [...older, ...latestMessages];
        });
        setHasMore(data.has_more ?? hasMore);
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
    [sending, hasMore]
  );

  return { messages, input, setInput, sendMessage, sending, loading, loadOlder, loadingMore, hasMore };
}
