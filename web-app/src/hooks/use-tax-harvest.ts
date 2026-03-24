"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { apiGet, apiDelete, apiPost, apiPostForm } from "@/lib/api";
import { apiStream } from "@/lib/api-stream";

// ── Types ──────────────────────────────────────────────────────────────────────

export interface IntakeWidget {
  field: string;
  question: string;
  options: { label: string; value: string }[];
  multi: boolean;
}

export interface TaxHarvestMessage {
  role: "user" | "assistant" | "status";
  content: string;
  analysisPayload?: AnalysisPayload;
  intakeWidget?: IntakeWidget;
}

export interface SessionState {
  step?: string;
  income_slab?: string | null;
  tax_regime?: string | null;
  resident_status?: string | null;
  brokers?: string[];
  has_fno?: boolean | null;
  has_mf_outside_demat?: boolean | null;
  documents_needed?: string[];
  documents_done?: string[];
  has_cas?: boolean;
  has_broker_pl?: boolean;
  has_broker_holdings?: boolean;
  has_itr?: boolean;
  has_tax_analysis?: boolean;
  total_tax?: number | null;
  exemption_remaining?: number | null;
}

export interface TermAction {
  action_type: "UPGRADE_TERM" | "AVOID_SELL";
  instrument_name: string;
  instrument_type: string;
  days_to_threshold: number;
  threshold_label: string;
  current_gain_loss: number;
  tax_implication: string;
  tax_saving_if_wait: number;
  rationale: string;
  priority: "HIGH" | "MEDIUM" | "LOW";
}

export interface OpenPosition {
  scrip_name?: string;
  isin?: string;
  symbol?: string;
  total_quantity?: number;
  current_value?: number;
  total_invested?: number;
  unrealised_gain?: number;
  is_long_term?: boolean;
  has_mixed_lots?: boolean;
  asset_class?: string;
}

export interface AnalysisPayload {
  tax_year: string;
  income_slab: string | null;
  tax_regime: string | null;
  resident_status: string | null;
  realised?: Record<string, unknown>;
  tax?: Record<string, unknown>;
  total_tax?: number | null;
  exemption_used?: number | null;
  exemption_remaining?: number | null;
  optimal_vs_naive_saving?: number | null;
  loss_harvest_mf?: LossCandidate[];
  loss_harvest_stocks?: LossCandidate[];
  gains_harvest_mf?: GainsCandidate[];
  term_actions?: TermAction[];
  open_positions?: OpenPosition[];
  warnings?: string[];
  cf_ltcl_remaining?: number | null;
  cf_stcl_remaining?: number | null;
}

export interface LossCandidate {
  fund_name?: string;
  scrip_name?: string;
  isin?: string;
  loss_type?: string;
  unrealised_loss?: number;
  holding_days?: number;
  is_equity_oriented?: boolean;
  tax_saved?: number;
  exit_load_pct?: number;
  excluded?: boolean;
  exclude_reason?: string;
}

export interface GainsCandidate {
  fund_name?: string;
  isin?: string;
  scheme_code?: string;
  unrealised_ltcg?: number;
  holding_days?: number;
  harvestable_up_to?: number;
  exit_load_pct?: number;
}

export interface UploadResult {
  status: "parsed" | "needs_password" | "wrong_password" | "needs_confirmation" | "needs_detailed" | "error";
  filename?: string;
  message?: string;
  question?: string;
  parsed?: Record<string, unknown>;
  session_summary?: SessionState;
  sentinel?: string;
}

export interface TaxDocument {
  id: string;
  doc_type: string;
  broker_name?: string;
  file_name: string;
  parse_status: string;
  uploaded_at: string;
}

// ── Hook ───────────────────────────────────────────────────────────────────────

export function useTaxHarvest() {
  const [messages, setMessages] = useState<TaxHarvestMessage[]>([]);
  const [sessionState, setSessionState] = useState<SessionState>({});
  const [analysisPayload, setAnalysisPayload] = useState<AnalysisPayload | null>(null);
  const [documents, setDocuments] = useState<TaxDocument[]>([]);
  const [sending, setSending] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [loading, setLoading] = useState(true);
  const loadedRef = useRef(false);

  // Load session on mount
  const loadSession = useCallback(async () => {
    try {
      const data = await apiGet<{ session_state: SessionState }>("/tax-harvest/session");
      setSessionState(data.session_state || {});
    } catch {
      // No session yet — that's fine
    } finally {
      setLoading(false);
    }
  }, []);

  const loadDocuments = useCallback(async () => {
    try {
      const data = await apiGet<{ documents: TaxDocument[] }>("/tax-harvest/documents");
      setDocuments(data.documents || []);
    } catch {
      // silently fail
    }
  }, []);

  useEffect(() => {
    if (!loadedRef.current) {
      loadedRef.current = true;
      loadSession();
      loadDocuments();
    }
  }, [loadSession, loadDocuments]);

  // Send a chat message
  const sendMessage = useCallback(
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
      let receivedFirstToken = false;

      try {
        await apiStream(
          "/tax-harvest/message",
          { content: text },
          (event) => {
            const content = event.content;
            // status event — keep the typing indicator (empty assistant bubble) visible
            if (event.type === "status") return;
            if (event.type === "token" && typeof content === "string") {
              // Clear the typing indicator on first real token
              if (!receivedFirstToken) receivedFirstToken = true;
              streamedContent += content;
              const updated = streamedContent;
              setMessages((prev) => {
                const copy = [...prev];
                const last = copy.length - 1;
                if (last >= 0 && copy[last].role === "assistant") {
                  copy[last] = { ...copy[last], content: updated };
                }
                return copy;
              });
            } else if (event.type === "analysis" && content && typeof content === "object") {
              const payload = content as unknown as AnalysisPayload;
              setAnalysisPayload(payload);
              setMessages((prev) => {
                const copy = [...prev];
                const last = copy.length - 1;
                if (last >= 0 && copy[last].role === "assistant") {
                  copy[last] = { ...copy[last], analysisPayload: payload };
                }
                return copy;
              });
            } else if (event.type === "done") {
              const ss = event.session_state as SessionState | undefined;
              if (ss) setSessionState(ss);
              const widget = (event as unknown as Record<string, unknown>).intake_widget as IntakeWidget | undefined;
              if (widget) {
                setMessages((prev) => {
                  const copy = [...prev];
                  const last = copy.length - 1;
                  if (last >= 0 && copy[last].role === "assistant") {
                    copy[last] = { ...copy[last], intakeWidget: widget };
                  }
                  return copy;
                });
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

  // Upload a document
  const uploadDocument = useCallback(
    async (
      file: File,
      docType: string,
      brokerName?: string,
      password?: string
    ): Promise<UploadResult> => {
      setUploading(true);
      try {
        const form = new FormData();
        form.append("file", file);
        form.append("doc_type", docType);
        if (brokerName) form.append("broker_name", brokerName);
        if (password) form.append("password", password);

        const result = await apiPostForm<UploadResult>("/tax-harvest/upload", form);

        if (result.status === "parsed") {
          // Update session state
          if (result.session_summary) {
            setSessionState(result.session_summary);
          }
          // Reload documents
          await loadDocuments();

          // Inject a status message so the user sees the upload was processed
          if (result.sentinel) {
            // Send the sentinel to the agent so it can acknowledge the upload
            await sendMessageAfterUpload(result.sentinel, result);
          }
        }

        return result;
      } catch (e) {
        return {
          status: "error",
          message: e instanceof Error ? e.message : "Upload failed. Please try again.",
        };
      } finally {
        setUploading(false);
      }
    },
    [loadDocuments]
  );

  // Internal: send a system message to the agent after a successful upload
  const sendMessageAfterUpload = useCallback(
    async (sentinel: string, result: UploadResult) => {
      setSending(true);
      // Show the upload confirmation as a user message
      setMessages((prev) => [
        ...prev,
        {
          role: "status" as const,
          content: `✅ Document uploaded successfully${result.session_summary?.documents_done ? ` (${result.session_summary.documents_done.join(", ")} done)` : ""}`,
        },
        { role: "assistant" as const, content: "" },
      ]);

      let streamedContent = "";
      try {
        await apiStream(
          "/tax-harvest/message",
          { content: sentinel },
          (event) => {
            const content = event.content;
            if (event.type === "token" && typeof content === "string") {
              streamedContent += content;
              const updated = streamedContent;
              setMessages((prev) => {
                const copy = [...prev];
                const last = copy.length - 1;
                if (last >= 0 && copy[last].role === "assistant") {
                  copy[last] = { ...copy[last], content: updated };
                }
                return copy;
              });
            } else if (event.type === "analysis" && content && typeof content === "object") {
              const payload = content as unknown as AnalysisPayload;
              setAnalysisPayload(payload);
              setMessages((prev) => {
                const copy = [...prev];
                const last = copy.length - 1;
                if (last >= 0 && copy[last].role === "assistant") {
                  copy[last] = { ...copy[last], analysisPayload: payload };
                }
                return copy;
              });
            } else if (event.type === "done") {
              const ss = event.session_state as SessionState | undefined;
              if (ss) setSessionState(ss);
            }
          }
        );
      } catch {
        setMessages((prev) => {
          const copy = [...prev];
          const last = copy.length - 1;
          if (last >= 0 && copy[last].role === "assistant") {
            copy[last] = { ...copy[last], content: "I noticed your upload. Please let me know if you have any questions." };
          }
          return copy;
        });
      } finally {
        setSending(false);
      }
    },
    []
  );

  // Confirm a summary CAS (user confirms no transactions)
  const confirmSummaryCas = useCallback(
    async (hasTransactions: boolean, parsed: Record<string, unknown>): Promise<UploadResult> => {
      try {
        const result = await apiPost<UploadResult>("/tax-harvest/upload/confirm-summary-cas", {
          has_transactions: hasTransactions,
          parsed,
        });
        if (result.session_summary) {
          setSessionState(result.session_summary);
        }
        return result;
      } catch (e) {
        return { status: "error", message: "Could not confirm CAS. Please try again." };
      }
    },
    []
  );

  // Delete a document
  const deleteDocument = useCallback(async (docId: string) => {
    try {
      await apiDelete(`/tax-harvest/documents/${docId}`);
      setDocuments((prev) => prev.filter((d) => d.id !== docId));
    } catch {
      // silently fail
    }
  }, []);

  // Start over
  const startOver = useCallback(async () => {
    try {
      await apiPost("/tax-harvest/session");
      setMessages([]);
      setSessionState({});
      setAnalysisPayload(null);
      setDocuments([]);
    } catch {
      // silently fail
    }
  }, []);

  return {
    messages,
    sessionState,
    analysisPayload,
    documents,
    sending,
    uploading,
    loading,
    sendMessage,
    uploadDocument,
    confirmSummaryCas,
    deleteDocument,
    startOver,
    loadDocuments,
  };
}
