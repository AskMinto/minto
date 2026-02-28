"use client";

import { CHART_COLORS } from "@/lib/constants";

interface AssetItem {
  label: string;
  pct: number;
}

export function AssetAllocationBar({ data }: { data: AssetItem[] }) {
  if (!data.length) return null;

  return (
    <div>
      <h4 className="text-sm font-medium text-minto-text mb-3">Asset Allocation</h4>
      <div className="flex h-3 rounded-full overflow-hidden mb-2">
        {data.map((asset, i) => (
          <div
            key={asset.label}
            className="h-full"
            style={{
              flex: asset.pct || 1,
              backgroundColor: CHART_COLORS[i % CHART_COLORS.length],
            }}
          />
        ))}
      </div>
      <div className="flex flex-wrap gap-3">
        {data.map((asset, i) => (
          <div key={asset.label} className="flex items-center gap-1.5 text-xs">
            <span
              className="w-2 h-2 rounded-full"
              style={{ backgroundColor: CHART_COLORS[i % CHART_COLORS.length] }}
            />
            <span className="text-minto-text-secondary">
              {asset.label} {asset.pct?.toFixed(0)}%
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
