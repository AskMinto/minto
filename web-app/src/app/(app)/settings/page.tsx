"use client";

import { useEffect, useState } from "react";
import { useAuth } from "@/providers/auth-provider";
import { apiGet, apiPost } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/spinner";
import { formatDate } from "@/lib/format";
import { Shield, Link2, RefreshCw, LogOut } from "lucide-react";
import Link from "next/link";

interface RiskProfile {
  risk_level: string;
  risk_score: number;
}

interface ZerodhaStatus {
  connected: boolean;
  holdings_count: number;
  imported_at: string | null;
}

export default function SettingsPage() {
  const { user, signOut } = useAuth();
  const [riskProfile, setRiskProfile] = useState<RiskProfile | null>(null);
  const [zerodha, setZerodha] = useState<ZerodhaStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [connectError, setConnectError] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      try {
        const [rp, zs] = await Promise.allSettled([
          apiGet<RiskProfile>("/risk/profile"),
          apiGet<ZerodhaStatus>("/zerodha/status"),
        ]);
        if (rp.status === "fulfilled") setRiskProfile(rp.value);
        if (zs.status === "fulfilled") setZerodha(zs.value);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const handleZerodhaConnect = async () => {
    try {
      setConnecting(true);
      setConnectError(null);

      const redirectUrl = `${window.location.origin}/settings`;
      const { url } = await apiGet<{ url: string }>(
        `/zerodha/login-url?app_redirect=${encodeURIComponent(redirectUrl)}`
      );

      const popup = window.open(url, "zerodha_login", "width=600,height=700");

      // Poll for popup close / listen for redirect
      const interval = setInterval(async () => {
        try {
          if (popup?.closed) {
            clearInterval(interval);
            // Reload zerodha status
            const zs = await apiGet<ZerodhaStatus>("/zerodha/status");
            setZerodha(zs);
            setConnecting(false);
          }
          // Try to read popup URL for request_token
          const popupUrl = popup?.location?.href;
          if (popupUrl && popupUrl.includes("request_token=")) {
            const params = new URL(popupUrl).searchParams;
            const token = params.get("request_token");
            popup?.close();
            clearInterval(interval);
            if (token) {
              await apiPost("/zerodha/callback", { request_token: token });
              const zs = await apiGet<ZerodhaStatus>("/zerodha/status");
              setZerodha(zs);
            }
            setConnecting(false);
          }
        } catch {
          // Cross-origin — keep polling
        }
      }, 500);
    } catch (err: unknown) {
      setConnectError(err instanceof Error ? err.message : "Failed to connect");
      setConnecting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Spinner size={28} />
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-2xl mx-auto px-6 py-8">
        <h1 className="text-2xl font-bold text-minto-text mb-1">Settings</h1>
        <p className="text-sm text-minto-text-muted mb-6">Your preferences and connections.</p>

        {/* Risk Profile */}
        <Card className="mb-4">
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-xl bg-minto-accent/10 flex items-center justify-center shrink-0">
              <Shield size={16} className="text-minto-accent" />
            </div>
            <div className="flex-1">
              <p className="text-xs font-medium text-minto-text-muted">Risk Tolerance</p>
              <p className="text-lg font-bold text-minto-text mt-0.5">
                {riskProfile?.risk_level?.toUpperCase() || "Not set"}
              </p>
              {riskProfile?.risk_score != null && (
                <p className="text-xs text-minto-text-muted">Score: {riskProfile.risk_score}</p>
              )}
            </div>
            <Link href="/onboarding/risk-quiz">
              <Button variant="secondary" size="sm">Edit</Button>
            </Link>
          </div>
        </Card>

        {/* Zerodha Connection */}
        <Card className="mb-4">
          <div className="flex items-start gap-3 mb-3">
            <div className="w-9 h-9 rounded-xl bg-red-500/10 flex items-center justify-center shrink-0">
              <Link2 size={16} className="text-red-500" />
            </div>
            <div className="flex-1">
              <p className="text-xs font-medium text-minto-text-muted">Zerodha</p>
              <p className="text-sm font-medium text-minto-text mt-0.5">
                {zerodha?.connected ? "Connected" : "Not connected"}
              </p>
            </div>
            {zerodha?.connected && (
              <Badge variant="green">Active</Badge>
            )}
          </div>

          {zerodha?.connected && (
            <div className="flex gap-3 mb-3 ml-12">
              <div className="glass-card !p-3 flex-1">
                <p className="text-[10px] text-minto-text-muted">Holdings</p>
                <p className="text-sm font-bold text-minto-text">{zerodha.holdings_count}</p>
              </div>
              <div className="glass-card !p-3 flex-1">
                <p className="text-[10px] text-minto-text-muted">Imported</p>
                <p className="text-sm font-bold text-minto-text">{formatDate(zerodha.imported_at)}</p>
              </div>
            </div>
          )}

          {connectError && <p className="text-xs text-minto-negative mb-2 ml-12">{connectError}</p>}

          <div className="ml-12">
            <Button onClick={handleZerodhaConnect} disabled={connecting} variant="secondary" size="sm">
              {connecting ? <Spinner size={14} /> : <RefreshCw size={14} />}
              {zerodha?.connected ? "Re-import" : "Connect Zerodha"}
            </Button>
          </div>
        </Card>

        {/* Account */}
        <Card className="mb-4">
          <p className="text-xs font-medium text-minto-text-muted mb-1">Account</p>
          <p className="text-sm text-minto-text">{user?.email || "—"}</p>
        </Card>

        {/* Sign Out */}
        <Button onClick={signOut} variant="destructive" size="md" className="w-full">
          <LogOut size={16} /> Sign Out
        </Button>
      </div>
    </div>
  );
}
