"use client";

import { useState } from "react";
import { useDashboard } from "@/hooks/use-dashboard";
import { useFinancialProfile } from "@/hooks/use-financial-profile";
import { PortfolioSummary } from "@/components/dashboard/portfolio-summary";
import { TopHoldingsTable } from "@/components/dashboard/top-holdings-table";
import { MFHoldingsTable } from "@/components/dashboard/mf-holdings-table";
import { DonutChart } from "@/components/dashboard/donut-chart";
import { AssetAllocationBar } from "@/components/dashboard/asset-allocation-bar";
import { ConcentrationRisk } from "@/components/dashboard/concentration-risk";
import { FinancialProfileTab } from "@/components/dashboard/financial-profile-tab";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { RefreshCw, Plus, Upload } from "lucide-react";
import Link from "next/link";

type Tab = "portfolio" | "balance-sheet";

export default function DashboardPage() {
  const [activeTab, setActiveTab] = useState<Tab>("portfolio");
  const { data, loading, error, refresh } = useDashboard();
  const { data: profile, loading: profileLoading, error: profileError } = useFinancialProfile();

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <Spinner size={28} />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-4">
        <p className="text-minto-negative text-sm">{error}</p>
        <Button onClick={refresh} variant="secondary" size="sm">
          Retry
        </Button>
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-6xl mx-auto px-6 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-minto-text">Dashboard</h1>
          </div>
          <Button onClick={refresh} variant="secondary" size="sm">
            <RefreshCw size={14} /> Refresh
          </Button>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 p-1 rounded-xl bg-minto-text/5 mb-6 w-fit">
          {[
            { id: "portfolio" as Tab, label: "Portfolio" },
            { id: "balance-sheet" as Tab, label: "Balance Sheet" },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                activeTab === tab.id
                  ? "bg-white text-minto-text shadow-sm"
                  : "text-minto-text-muted hover:text-minto-text-secondary"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Portfolio Tab */}
        {activeTab === "portfolio" && (
          <>
            {/* Summary cards */}
            <PortfolioSummary totals={data.totals} />

            {/* Quick actions */}
            <div className="flex gap-3 mt-4 mb-6">
              <Link href="/holdings">
                <Button variant="primary" size="sm">
                  <Plus size={14} /> Add Holding
                </Button>
              </Link>
              <Link href="/settings">
                <Button variant="secondary" size="sm">
                  <Upload size={14} /> Import from Zerodha
                </Button>
              </Link>
            </div>

            {/* Holdings tables */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
              <TopHoldingsTable holdings={data.top_holdings as never[]} />
              <MFHoldingsTable holdings={data.mf_holdings as never[]} />
            </div>

            {/* Asset allocation */}
            {data.asset_split.length > 0 && (
              <Card className="mb-6">
                <AssetAllocationBar data={data.asset_split} />
              </Card>
            )}

            {/* Breakdown charts */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
              <Card>
                <DonutChart data={data.sector_split} title="Sector Breakdown" />
              </Card>
              <Card>
                <DonutChart data={data.mcap_split} title="Market Cap" />
              </Card>
            </div>

            {/* Concentration risk */}
            <ConcentrationRisk flags={data.concentration_flags} />
          </>
        )}

        {/* Balance Sheet Tab */}
        {activeTab === "balance-sheet" && (
          <>
            {profileLoading ? (
              <div className="flex items-center justify-center py-20">
                <Spinner size={28} />
              </div>
            ) : profileError ? (
              <div className="flex flex-col items-center justify-center py-20 gap-3">
                <p className="text-minto-negative text-sm">{profileError}</p>
              </div>
            ) : profile ? (
              <FinancialProfileTab profile={profile} />
            ) : (
              <Card className="text-center py-12">
                <p className="text-minto-text-muted text-sm">
                  No financial profile found. Complete the financial profile questionnaire to see your balance sheet here.
                </p>
                <Link href="/onboarding/financial-profile" className="mt-3 inline-block">
                  <Button variant="primary" size="sm">
                    Complete Profile
                  </Button>
                </Link>
              </Card>
            )}
          </>
        )}
      </div>
    </div>
  );
}
