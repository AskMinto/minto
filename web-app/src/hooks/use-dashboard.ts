"use client";

import { useState, useEffect, useCallback } from "react";
import { apiGet } from "@/lib/api";

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
  concentration_flags: {
    type: string;
    label: string;
    pct: number;
    severity: string;
    why: string;
  }[];
}

export function useDashboard() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { data, loading, error, refresh };
}
