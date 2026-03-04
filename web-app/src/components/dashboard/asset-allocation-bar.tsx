"use client";

import { ASSET_CLASS_COLORS, CHART_COLORS } from "@/lib/constants";

interface AssetItem {
  label: string;
  value: number;
  pct: number;
}

export function AssetAllocationBar({ data }: { data: AssetItem[] }) {
  if (!data.length) return null;

  const sorted = [...data].sort((a, b) => b.value - a.value);

  const getColor = (label: string, i: number) =>
    ASSET_CLASS_COLORS[label] ?? CHART_COLORS[i % CHART_COLORS.length];

  return (
    <div>
      <h4 className="text-sm font-medium text-minto-text mb-3">
        Asset Class Allocation
      </h4>
      <div className="flex h-4 rounded-full overflow-hidden mb-3">
        {sorted.map((asset, i) => (
          <div
            key={asset.label}
            className="h-full transition-all duration-300"
            style={{
              flex: asset.pct || 1,
              backgroundColor: getColor(asset.label, i),
            }}
          />
        ))}
      </div>
      <div className="flex flex-wrap gap-4">
        {sorted.map((asset, i) => (
          <div key={asset.label} className="flex items-center gap-2 text-xs">
            <span
              className="w-2.5 h-2.5 rounded-full"
              style={{ backgroundColor: getColor(asset.label, i) }}
            />
            <span className="text-minto-text-secondary font-medium">
              {asset.label}
            </span>
            <span className="text-minto-text font-bold tabular-nums">
              {asset.pct?.toFixed(1)}%
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
