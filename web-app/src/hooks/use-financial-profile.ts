"use client";

import { useState, useEffect, useCallback } from "react";
import { apiGet } from "@/lib/api";

export interface FinancialProfileData {
  version: string;
  responses: Record<string, any>;
  metrics: {
    total_income: number;
    monthly_surplus: number;
    total_debt: number;
    total_assets: number;
    net_worth: number;
    savings_ratio: number;
    dti: number;
    expense_ratio: number;
    solvency_ratio: number;
    leverage_ratio: number;
    liquidity_ratio: number;
    fin_assets_ratio: number;
    acc_savings_income: number;
    esop_concentration: number;
    allocation: { indiaEq: number; gold: number; worldEq: number; stability: number };
  };
  updated_at: string;
}

export function useFinancialProfile() {
  const [data, setData] = useState<FinancialProfileData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const profile = await apiGet<FinancialProfileData>("/financial-profile");
      setData(profile);
    } catch (err: unknown) {
      if (err instanceof Error && err.message.includes("404")) {
        setData(null);
      } else {
        setError(err instanceof Error ? err.message : "Unable to load financial profile");
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { data, loading, error, refresh };
}
