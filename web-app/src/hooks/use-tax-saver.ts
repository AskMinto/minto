"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { apiGet, apiPost, apiDelete } from "@/lib/api";
import { apiStream } from "@/lib/api-stream";

// ── Types ──────────────────────────────────────────────────────────────────────

export type Phase = "loading" | "intake" | "upload" | "analysing" | "done";

export interface IntakeAnswers {
  income_slab: string | null;
  tax_regime: string | null;
  brokers: string[];
  has_carry_forward: boolean;
  financial_year: string;
}

export interface DocStatus {
  doc_key: string;
  label: string;
  icon: string;
  uploaded: boolean;
  preview: string | null;
}

export interface DocInstruction {
  doc_key: string;
  label: string;
  icon: string;
  description: string;
  steps: string[];
  password_hint: string | null;
  file_types: string[];
  uploaded: boolean;
  preview: string | null;
}

export interface ChatMessage {
  role: "user" | "assistant" | "status";
  content: string;
}

export interface UploadResult {
  status: "extracted" | "needs_password" | "wrong_password" | "likely_invalid" | "error";
  doc_key?: string;
  filename?: string;
  hint?: string;
  message?: string;
  preview?: string;
  all_uploaded?: boolean;
  remaining_docs?: string[];
}

// ── Hook ───────────────────────────────────────────────────────────────────────

export function useTaxSaver() {
  const [phase, setPhase] = useState<Phase>("loading");
  const [intakeAnswers, setIntakeAnswers] = useState<IntakeAnswers | null>(null);
  const [docInstructions, setDocInstructions] = useState<DocInstruction[]>([]);
  const [allUploaded, setAllUploaded] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [sending, setSending] = useState(false);
  const [uploading, setUploading] = useState<string | null>(null); // doc_key being uploaded
  const loadedRef = useRef(false);

  // Load session on mount
  const loadSession = useCallback(async () => {
    try {
      const data = await apiGet<{
        has_intake: boolean;
        intake_answers: IntakeAnswers | null;
        doc_instructions: DocInstruction[];
        all_uploaded: boolean;
        message_count: number;
      }>("/tax-saver/session");

      if (data.has_intake && data.intake_answers) {
        setIntakeAnswers(data.intake_answers);
        setDocInstructions(data.doc_instructions || []);
        setAllUploaded(data.all_uploaded);

        if (data.message_count > 0) {
          // Load message history
          const msgData = await apiGet<{ messages: ChatMessage[] }>("/tax-saver/messages");
          setMessages(msgData.messages || []);
          // Determine phase from messages
          const hasDoneMessage = msgData.messages.some(
            (m) => m.role === "assistant" && m.content.length > 100
          );
          setPhase(hasDoneMessage ? "done" : data.all_uploaded ? "upload" : "upload");
        } else {
          setPhase("upload");
        }
      } else {
        setPhase("intake");
      }
    } catch {
      setPhase("intake");
    }
  }, []);

  useEffect(() => {
    if (!loadedRef.current) {
      loadedRef.current = true;
      loadSession();
    }
  }, [loadSession]);

  // Submit intake answers → POST /tax-saver/intake
  const submitIntake = useCallback(async (answers: IntakeAnswers) => {
    const data = await apiPost<{
      status: string;
      intake_answers: IntakeAnswers;
      doc_instructions: DocInstruction[];
      all_uploaded: boolean;
    }>("/tax-saver/intake", answers);

    setIntakeAnswers(data.intake_answers);
    setDocInstructions(data.doc_instructions || []);
    setAllUploaded(data.all_uploaded);
    setPhase("upload");
  }, []);

  // Upload a document → POST /tax-saver/upload/{doc_key}
  const uploadDocument = useCallback(
    async (
      docKey: string,
      file: File,
      password?: string
    ): Promise<UploadResult> => {
      setUploading(docKey);
      try {
        // Build URL with optional password query param
        const token = await getToken();
        const apiBase =
          typeof window !== "undefined"
            ? "/api/proxy"
            : process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000";

        const url = new URL(`${apiBase}/tax-saver/upload/${docKey}`, window.location.origin);
        if (password) url.searchParams.set("password", password);

        const form = new FormData();
        form.append("file", file);

        const headers: Record<string, string> = {
          "ngrok-skip-browser-warning": "true",
        };
        if (token) headers["Authorization"] = `Bearer ${token}`;

        const response = await fetch(url.toString(), {
          method: "POST",
          headers,
          body: form,
        });

        if (!response.ok) {
          // For PDFs the Gemini extraction takes 30-90s — the Cloud Run proxy
          // can timeout and return 500 even though the backend succeeded and
          // saved the result to the DB. Poll /tax-saver/docs until the doc
          // appears (up to 2 minutes) before giving up with an error.
          if (docKey.endsWith("_pdf") || docKey === "cas_pdf" || docKey === "itr_pdf") {
            const found = await pollUntilDocUploaded(docKey, 120, 5);
            if (found) {
              const docData = await apiGet<{
                doc_instructions: DocInstruction[];
                all_uploaded: boolean;
              }>("/tax-saver/docs");
              setDocInstructions(docData.doc_instructions || []);
              setAllUploaded(docData.all_uploaded);
              return { status: "extracted", doc_key: docKey, preview: "" };
            }
          }
          const text = await response.text().catch(() => "");
          return { status: "error", message: text || "Upload failed. Please try again." };
        }

        const result: UploadResult = await response.json();

        if (result.status === "extracted") {
          // Refresh doc list
          const docData = await apiGet<{
            doc_instructions: DocInstruction[];
            all_uploaded: boolean;
          }>("/tax-saver/docs");
          setDocInstructions(docData.doc_instructions || []);
          setAllUploaded(docData.all_uploaded);

          if (docData.all_uploaded) {
            // All docs uploaded — stay in upload phase, show Analyse button
          }
        }

        return result;
      } catch (e) {
        return {
          status: "error",
          message: e instanceof Error ? e.message : "Upload failed. Please try again.",
        };
      } finally {
        setUploading(null);
      }
    },
    []
  );

  // Run analysis → POST /tax-saver/analyse (SSE)
  const runAnalysis = useCallback(async () => {
    if (sending) return;
    setSending(true);
    setPhase("analysing");
    setMessages([{ role: "assistant", content: "" }]);

    let streamedContent = "";

    const tryStream = async () => {
      await apiStream(
        "/tax-saver/analyse",
        {},
        (event) => {
          if (event.type === "token" && typeof event.content === "string") {
            streamedContent += event.content;
            setMessages([{ role: "assistant", content: streamedContent }]);
          } else if (event.type === "done") {
            setPhase("done");
          }
        }
      );
    };

    try {
      await tryStream();
    } catch {
      // Stream dropped (proxy timeout) — check if the backend saved the result anyway
      if (!streamedContent) {
        try {
          const data = await apiGet<{ messages: ChatMessage[] }>("/tax-saver/messages");
          const saved = data.messages ?? [];
          // Find the last assistant message — that's the analysis
          const lastAssistant = [...saved].reverse().find((m) => m.role === "assistant");
          if (lastAssistant?.content) {
            streamedContent = lastAssistant.content;
            setMessages(saved);
          }
        } catch {
          // ignore — fallthrough to error state below
        }
      }

      if (!streamedContent) {
        setMessages([{
          role: "assistant",
          content: "The analysis is taking longer than expected — please reload the page to see if it completed.",
        }]);
      }

      setPhase("done");
    } finally {
      // If stream ended without "done" event but we have content, show it
      if (streamedContent) setPhase("done");
      setSending(false);
    }
  }, [sending]);

  // Follow-up chat → POST /tax-saver/chat (SSE)
  const sendFollowUp = useCallback(
    async (content: string) => {
      if (!content.trim() || sending) return;
      const text = content.trim();
      setSending(true);

      setMessages((prev) => [
        ...prev,
        { role: "user", content: text },
        { role: "assistant", content: "" },
      ]);

      let streamedContent = "";

      try {
        await apiStream(
          "/tax-saver/chat",
          { content: text },
          (event) => {
            if (event.type === "token" && typeof event.content === "string") {
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
      } catch {
        setMessages((prev) => {
          const copy = [...prev];
          const last = copy.length - 1;
          if (last >= 0 && copy[last].role === "assistant") {
            copy[last] = {
              ...copy[last],
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

  // Start over — delete session and reset to intake
  const startOver = useCallback(async () => {
    try {
      await apiDelete("/tax-saver/session");
    } catch {
      // silently fail
    }
    setPhase("intake");
    setIntakeAnswers(null);
    setDocInstructions([]);
    setAllUploaded(false);
    setMessages([]);
  }, []);

  const goToUpload = useCallback(() => {
    setPhase("upload");
    setMessages([]);
  }, []);

  const refreshDocs = useCallback(async () => {
    try {
      const docData = await apiGet<{
        doc_instructions: DocInstruction[];
        all_uploaded: boolean;
      }>("/tax-saver/docs");
      setDocInstructions(docData.doc_instructions || []);
      setAllUploaded(docData.all_uploaded);
    } catch {
      // silently fail
    }
  }, []);

  return {
    phase,
    intakeAnswers,
    docInstructions,
    allUploaded,
    messages,
    sending,
    uploading,
    submitIntake,
    uploadDocument,
    runAnalysis,
    sendFollowUp,
    startOver,
    goToUpload,
    refreshDocs,
  };
}

// Poll GET /tax-saver/docs until doc_key appears as uploaded, or timeout.
// Used for PDF uploads where the Gemini extraction outlasts the proxy timeout.
async function pollUntilDocUploaded(
  docKey: string,
  timeoutSecs: number,
  intervalSecs: number
): Promise<boolean> {
  const deadline = Date.now() + timeoutSecs * 1000;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, intervalSecs * 1000));
    try {
      const data = await apiGet<{ doc_instructions: { doc_key: string; uploaded: boolean }[] }>(
        "/tax-saver/docs"
      );
      const doc = (data.doc_instructions || []).find((d) => d.doc_key === docKey);
      if (doc?.uploaded) return true;
    } catch {
      // network blip — keep trying
    }
  }
  return false;
}

// Helper to get the Supabase token
async function getToken(): Promise<string | null> {
  const { createClient } = await import("@/lib/supabase/client");
  const supabase = createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return session?.access_token ?? null;
}
