"use client";

import { useState, useEffect, useCallback } from "react";
import { apiGet, apiPost, apiDelete } from "@/lib/api";

export interface PriceAlert {
  id: string;
  display_name: string;
  alert_type: "above" | "below" | "pct_change_up" | "pct_change_down";
  target_value: number;
  symbol?: string;
  exchange?: string;
  scheme_code?: number;
  status: "active" | "triggered" | "cancelled";
  triggered_at?: string;
  triggered_price?: number;
  created_at: string;
}

export interface CreateAlertPayload {
  display_name: string;
  alert_type: "above" | "below" | "pct_change_up" | "pct_change_down";
  target_value: number;
  symbol?: string;
  exchange?: string;
  scheme_code?: number;
}

export function useAlerts() {
  const [alerts, setAlerts] = useState<PriceAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadAlerts = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await apiGet<{ alerts: PriceAlert[] }>("/alerts");
      setAlerts(data.alerts || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load alerts");
      setAlerts([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAlerts();
  }, [loadAlerts]);

  const createAlert = useCallback(
    async (payload: CreateAlertPayload) => {
      await apiPost("/alerts", payload);
      await loadAlerts();
    },
    [loadAlerts]
  );

  const cancelAlert = useCallback(
    async (alertId: string) => {
      await apiDelete(`/alerts/${alertId}`);
      await loadAlerts();
    },
    [loadAlerts]
  );

  return { alerts, loading, error, loadAlerts, createAlert, cancelAlert };
}
