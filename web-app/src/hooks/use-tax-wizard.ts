"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { apiGet, apiPost, apiPostForm, apiDelete } from "@/lib/api";

// ── Types ────────────────────────────────────────────────────────────────────

export type WizardStep =
  | "welcome"
  | "residency_check"
  | "portfolio_type"
  | "nps_tier"
  | "ulip_check"
  | "cf_check"
  | "cf_how_to_check"
  | "tax_regime"
  | "income_bracket"
  | "documents"
  | "analysis"
  | "blocked";

export interface TaxSummary {
  total_tax: number | null;
  exemption_used: number | null;
  exemption_remaining: number | null;
  slab_rate: number | null;
  tax_regime: string | null;
  realised?: Record<string, number>;
  tax?: Record<string, number>;
  step4_87a?: Record<string, unknown>;
  optimal_vs_naive_saving?: number;
  cf_ltcl_remaining?: number;
  cf_stcl_remaining?: number;
}

export interface LossCandidate {
  fund_name?: string;
  scrip_name?: string;
  unrealised_gain: number;
  loss_type: string;
  exit_load_pct?: number;
  tax_saved: number;
  cf_value: number;
  holding_days?: number;
  excluded: boolean;
  exclude_reason?: string | null;
  eligible_after_date?: string | null;
}

export interface GainsCandidate {
  fund_name: string;
  fund_category?: string;
  unrealised_ltcg: number;
  net_ltcg_after_exit_load: number;
  exit_load_pct: number;
  holding_days: number;
  is_elss: boolean;
  harvestable_up_to: number;
}

export interface WizardSessionState {
  step: WizardStep;
  portfolio_type: string[];
  nps_tier: string | null;
  ulip_disclaimer_active: boolean;
  carry_forward: boolean | null;
  tax_regime: string | null;
  slab_rate: number | null;
  base_income: number | null;
  documents_needed: string[];
  documents_done: string[];
  has_cas: boolean;
  has_broker_pl: boolean;
  has_broker_holdings: boolean;
  has_itr: boolean;
  has_tax_analysis: boolean;
  tax_analysis: TaxSummary | null;
  loss_harvest_mf: LossCandidate[];
  loss_harvest_stocks: LossCandidate[];
  gains_harvest_mf: GainsCandidate[];
  ulip_disclaimer_active_state: boolean;
  blocked: boolean;
  block_reason: string | null;
}

export interface TaxDocument {
  id: string;
  doc_type: string;
  broker_name: string | null;
  file_name: string | null;
  parse_status: string;
  uploaded_at: string;
}

export interface HoldingsContext {
  has_holdings: boolean;
  summary: {
    total_holdings: number;
    equity_count: number;
    mf_count: number;
    message: string;
  } | null;
}

const DEFAULT_STATE: WizardSessionState = {
  step: "welcome",
  portfolio_type: [],
  nps_tier: null,
  ulip_disclaimer_active: false,
  carry_forward: null,
  tax_regime: null,
  slab_rate: null,
  base_income: null,
  documents_needed: [],
  documents_done: [],
  has_cas: false,
  has_broker_pl: false,
  has_broker_holdings: false,
  has_itr: false,
  has_tax_analysis: false,
  tax_analysis: null,
  loss_harvest_mf: [],
  loss_harvest_stocks: [],
  gains_harvest_mf: [],
  ulip_disclaimer_active_state: false,
  blocked: false,
  block_reason: null,
};

// ── Hook ─────────────────────────────────────────────────────────────────────

export function useTaxWizard() {
  const [sessionState, setSessionState] = useState<WizardSessionState>(DEFAULT_STATE);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [analysing, setAnalysing] = useState(false);
  const [uploadingDoc, setUploadingDoc] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [documents, setDocuments] = useState<TaxDocument[]>([]);
  const [holdingsContext, setHoldingsContext] = useState<HoldingsContext | null>(null);
  const loadedRef = useRef(false);

  const loadSession = useCallback(async () => {
    try {
      const data = await apiGet<Record<string, unknown>>("/tax/session");
      setSessionState((prev) => ({
        ...prev,
        step: (data.step as WizardStep) || "welcome",
        portfolio_type: (data.portfolio_type as string[]) || [],
        nps_tier: (data.nps_tier as string | null) ?? null,
        ulip_disclaimer_active: (data.ulip_disclaimer_active as boolean) ?? false,
        carry_forward: (data.carry_forward as boolean | null) ?? null,
        tax_regime: (data.tax_regime as string | null) ?? null,
        slab_rate: (data.slab_rate as number | null) ?? null,
        base_income: (data.base_income as number | null) ?? null,
        documents_needed: (data.documents_needed as string[]) || [],
        documents_done: (data.documents_done as string[]) || [],
        has_cas: (data.has_cas as boolean) ?? false,
        has_broker_pl: (data.has_broker_pl as boolean) ?? false,
        has_broker_holdings: (data.has_broker_holdings as boolean) ?? false,
        has_itr: (data.has_itr as boolean) ?? false,
        has_tax_analysis: (data.has_tax_analysis as boolean) ?? false,
        tax_analysis: (data.tax_analysis as TaxSummary | null) ?? null,
        blocked: (data.blocked as boolean) ?? false,
        block_reason: (data.block_reason as string | null) ?? null,
      }));
    } catch {
      // Use default state on error
    } finally {
      setLoading(false);
    }
  }, []);

  const loadDocuments = useCallback(async () => {
    try {
      const data = await apiGet<{ documents: TaxDocument[] }>("/tax/documents");
      setDocuments(data.documents || []);
    } catch {
      setDocuments([]);
    }
  }, []);

  const loadHoldingsContext = useCallback(async () => {
    try {
      const data = await apiGet<HoldingsContext>("/tax/holdings-context");
      setHoldingsContext(data);
    } catch {
      setHoldingsContext(null);
    }
  }, []);

  useEffect(() => {
    if (!loadedRef.current) {
      loadedRef.current = true;
      loadSession();
      loadDocuments();
      loadHoldingsContext();
    }
  }, [loadSession, loadDocuments, loadHoldingsContext]);

  // Save a single onboarding answer and advance the wizard step
  const saveAnswer = useCallback(
    async (key: string, value: unknown): Promise<void> => {
      setSaving(true);
      try {
        const result = await apiPost<{ status: string; documents_needed?: string[] }>(
          "/tax/onboarding",
          { key, value }
        );
        setSessionState((prev) => ({
          ...prev,
          [key]: value,
          documents_needed: result.documents_needed || prev.documents_needed,
        }));
      } finally {
        setSaving(false);
      }
    },
    []
  );

  // Advance the step (calls saveAnswer under the hood)
  const setStep = useCallback(
    (step: WizardStep) => saveAnswer("step", step),
    [saveAnswer]
  );

  // Run the tax analysis
  const runAnalysis = useCallback(async (): Promise<void> => {
    setAnalysing(true);
    try {
      const result = await apiPost<{
        status: string;
        analysis: TaxSummary;
        loss_harvest_mf: LossCandidate[];
        loss_harvest_stocks: LossCandidate[];
        gains_harvest_mf: GainsCandidate[];
      }>("/tax/analyse", {});

      setSessionState((prev) => ({
        ...prev,
        step: "analysis",
        has_tax_analysis: true,
        tax_analysis: result.analysis,
        loss_harvest_mf: result.loss_harvest_mf || [],
        loss_harvest_stocks: result.loss_harvest_stocks || [],
        gains_harvest_mf: result.gains_harvest_mf || [],
      }));
    } finally {
      setAnalysing(false);
    }
  }, []);

  // Upload a document (calls /tax/upload)
  const uploadDocument = useCallback(
    async (
      file: File,
      docType: string,
      brokerName?: string,
      password?: string
    ): Promise<{ status: string; message?: string }> => {
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
          session_summary?: Record<string, unknown>;
          message?: string;
        }>("/tax/upload", form);

        if (result.status === "parsed") {
          // Update local state: mark document as done
          const doneKey = `has_${docType}` as keyof WizardSessionState;
          setSessionState((prev) => {
            const docs_done = [...(prev.documents_done || [])];
            if (!docs_done.includes(docType)) docs_done.push(docType);
            return {
              ...prev,
              [doneKey]: true,
              documents_done: docs_done,
            };
          });
          // Reload documents list for the /documents page
          loadDocuments();
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
    [loadDocuments]
  );

  // Sync holdings from broker_holdings_parsed to holdings table
  const syncHoldings = useCallback(
    async (brokerName?: string): Promise<{ upserted: number; message: string }> => {
      const result = await apiPost<{ upserted: number; message: string }>(
        "/tax/sync-holdings",
        { broker_name: brokerName }
      );
      return result;
    },
    []
  );

  // Delete a document record
  const deleteDocument = useCallback(
    async (docId: string): Promise<void> => {
      await apiDelete(`/tax/documents/${docId}`);
      setDocuments((prev) => prev.filter((d) => d.id !== docId));
    },
    []
  );

  // Reload the full session from the server
  const refreshSession = useCallback(async () => {
    await loadSession();
    await loadDocuments();
  }, [loadSession, loadDocuments]);

  // Delete the session and reset to the welcome step
  const startOver = useCallback(async (): Promise<void> => {
    try {
      await apiDelete("/tax/session");
    } catch {
      // Non-fatal — reset local state regardless
    }
    setSessionState(DEFAULT_STATE);
    setDocuments([]);
  }, []);

  return {
    sessionState,
    loading,
    saving,
    analysing,
    uploadingDoc,
    uploadError,
    setUploadError,
    documents,
    holdingsContext,
    saveAnswer,
    setStep,
    runAnalysis,
    uploadDocument,
    syncHoldings,
    deleteDocument,
    refreshSession,
    startOver,
  };
}
