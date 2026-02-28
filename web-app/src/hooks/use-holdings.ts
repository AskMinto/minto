"use client";

import { useState, useEffect, useCallback } from "react";
import { apiGet, apiPost, apiPatch, apiDelete } from "@/lib/api";

interface Holding {
  id: string;
  symbol?: string;
  scheme_name?: string;
  scheme_code?: number;
  exchange?: string;
  qty: number;
  avg_cost?: number;
  asset_type?: string;
  value?: number;
  current_price?: number;
  pnl?: number;
  pnl_pct?: number;
  isin?: string;
}

export function useHoldings() {
  const [holdings, setHoldings] = useState<Holding[]>([]);
  const [loading, setLoading] = useState(true);

  const loadHoldings = useCallback(async () => {
    try {
      setLoading(true);
      const data = await apiGet<{ holdings: Holding[] }>("/holdings");
      setHoldings(data.holdings || []);
    } catch {
      setHoldings([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadHoldings();
  }, [loadHoldings]);

  const addHolding = useCallback(
    async (payload: Record<string, unknown>) => {
      await apiPost("/holdings", payload);
      await loadHoldings();
    },
    [loadHoldings]
  );

  const updateHolding = useCallback(
    async (id: string, payload: Record<string, unknown>) => {
      await apiPatch(`/holdings/${id}`, payload);
      await loadHoldings();
    },
    [loadHoldings]
  );

  const deleteHolding = useCallback(
    async (id: string) => {
      await apiDelete(`/holdings/${id}`);
      await loadHoldings();
    },
    [loadHoldings]
  );

  return { holdings, loading, loadHoldings, addHolding, updateHolding, deleteHolding };
}
