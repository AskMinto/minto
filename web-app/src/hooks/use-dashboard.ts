"use client";

import { useState, useEffect, useCallback } from "react";
import { apiGet, apiPost } from "@/lib/api";

export interface ConcentrationFlag {
  type: "stock" | "sector" | "top_concentration" | "overlap" | "currency" | "esop";
  label: string;
  pct: number | null;
  severity: "red" | "yellow" | "green";
  why: string;
}

export interface RiskAnalysis {
  risk_score: number;
  risk_level: "low" | "moderate" | "high" | "very_high";
  concentration_flags: ConcentrationFlag[];
  diversification_notes: string[];
  recommendations: string[];
  summary: string;
}

interface DashboardData {
  totals: {
    total_value: number;
    invested: number;
    pnl: number;
    pnl_pct: number;
    today_pnl: number;
  };
  top_holdings: Record<string, unknown>[];
  mf_holdings: Record<string, unknown>[];
  sector_split: { label: string; value: number; pct: number }[];
  mcap_split: { label: string; value: number; pct: number }[];
  asset_split: { label: string; value: number; pct: number }[];
  asset_class_split: { label: string; value: number; pct: number }[];
  concentration_flags: ConcentrationFlag[];
  risk_analysis: RiskAnalysis | null;
}

export function useDashboard() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [riskError, setRiskError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const dash = await apiGet<DashboardData>("/dashboard");
      setData(dash);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Unable to load portfolio");
    } finally {
      setLoading(false);
    }
  }, []);

  const analyzeRisk = useCallback(async () => {
    setAnalyzing(true);
    setRiskError(null);
    try {
      await apiPost("/dashboard/analyze-risk");
      await refresh();
    } catch (err: unknown) {
      setRiskError(err instanceof Error ? err.message : "Risk analysis failed");
    } finally {
      setAnalyzing(false);
    }
  }, [refresh]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { data, loading, error, refresh, analyzing, analyzeRisk, riskError };
}
