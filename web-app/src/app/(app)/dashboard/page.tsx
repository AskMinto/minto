"use client";

import { useDashboard } from "@/hooks/use-dashboard";
import { PortfolioSummary } from "@/components/dashboard/portfolio-summary";
import { TopHoldingsTable } from "@/components/dashboard/top-holdings-table";
import { MFHoldingsTable } from "@/components/dashboard/mf-holdings-table";
import { DonutChart } from "@/components/dashboard/donut-chart";
import { AssetAllocationBar } from "@/components/dashboard/asset-allocation-bar";
import { ConcentrationRisk } from "@/components/dashboard/concentration-risk";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { RefreshCw, Plus, Upload } from "lucide-react";
import Link from "next/link";

export default function DashboardPage() {
  const { data, loading, error, refresh } = useDashboard();

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
            <h1 className="text-2xl font-bold text-minto-text">Portfolio Overview</h1>
          </div>
          <Button onClick={refresh} variant="secondary" size="sm">
            <RefreshCw size={14} /> Refresh
          </Button>
        </div>

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
      </div>
    </div>
  );
}
