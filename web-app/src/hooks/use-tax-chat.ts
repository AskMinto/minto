"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { apiGet, apiPostForm } from "@/lib/api";
import { apiStream, SSEEvent } from "@/lib/api-stream";

export interface TaxMessage {
  role: "user" | "assistant";
  content: string;
}

export interface TaxSessionState {
  step?: string;
  documents_needed?: string[];
  documents_done?: string[];
  has_tax_analysis?: boolean;
  has_cas?: boolean;
  has_broker_pl?: boolean;
  has_broker_holdings?: boolean;
  has_itr?: boolean;
  exemption_remaining?: number | null;
  total_tax?: number | null;
  ulip_disclaimer_active?: boolean;
  reminder_opted_in?: boolean;
}

export function useTaxChat() {
  const [messages, setMessages] = useState<TaxMessage[]>([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const [sessionState, setSessionState] = useState<TaxSessionState | null>(null);
  const [uploadingDoc, setUploadingDoc] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const loadedRef = useRef(false);

  const loadMessages = useCallback(async () => {
    try {
      const data = await apiGet<{ messages: TaxMessage[] }>("/tax/messages");
      setMessages(data.messages || []);
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

  const sendMessage = useCallback(
    async (content: string) => {
      if (!content.trim() || sending) return;
      const text = content.trim();
      setInput("");
      setSending(true);

      setMessages((prev) => [
        ...prev,
        { role: "user", content: text },
        { role: "assistant", content: "" },
      ]);

      let streamedContent = "";

      try {
        await apiStream(
          "/tax/message/stream",
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
            } else if (event.type === "done") {
              // Update session state from done event payload
              const doneEvent = event as SSEEvent & { session_state?: TaxSessionState };
              if (doneEvent.session_state) {
                setSessionState(doneEvent.session_state);
              }
            }
          }
        );
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

  const uploadDocument = useCallback(
    async (
      file: File,
      docType: string,
      brokerName?: string,
      password?: string
    ): Promise<{ status: string; sentinel?: string; message?: string }> => {
      setUploadingDoc(true);
      setUploadError(null);

      const form = new FormData();
      form.append("file", file);
      form.append("doc_type", docType);
      if (brokerName) form.append("broker_name", brokerName);
      if (password) form.append("password", password);

      try {
        const result = await apiPostForm<{
          status: string;
          sentinel?: string;
          session_summary?: TaxSessionState;
          message?: string;
        }>("/tax/upload", form);

        if (result.session_summary) {
          setSessionState(result.session_summary);
        }

        if (result.status === "parsed" && result.sentinel) {
          // Inject the sentinel as a visible system message so the agent can respond
          setMessages((prev) => [
            ...prev,
            { role: "user", content: result.sentinel! },
            { role: "assistant", content: "" },
          ]);

          // Ask the agent to acknowledge the parsed document
          setSending(true);
          let streamedContent = "";
          try {
            await apiStream(
              "/tax/message/stream",
              { content: result.sentinel },
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
                } else if (event.type === "done") {
                  const doneEvent = event as SSEEvent & { session_state?: TaxSessionState };
                  if (doneEvent.session_state) {
                    setSessionState(doneEvent.session_state);
                  }
                }
              }
            );
          } catch {
            setMessages((prev) => {
              const copy = [...prev];
              const last = copy.length - 1;
              if (last >= 0 && copy[last].role === "assistant") {
                copy[last] = { role: "assistant", content: "Document uploaded. What would you like to do next?" };
              }
              return copy;
            });
          } finally {
            setSending(false);
          }
        }

        return result;
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : "Upload failed";
        setUploadError(message);
        return { status: "error", message };
      } finally {
        setUploadingDoc(false);
      }
    },
    []
  );

  return {
    messages,
    input,
    setInput,
    sendMessage,
    sending,
    loading,
    sessionState,
    uploadDocument,
    uploadingDoc,
    uploadError,
    setUploadError,
  };
}
